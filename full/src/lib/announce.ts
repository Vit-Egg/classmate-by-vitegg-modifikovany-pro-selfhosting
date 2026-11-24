/**
 * Oznámení od správce: poslat hned, nebo naplánovat na zvolený čas; volitelně i e-mailem všem příjemcům.
 * Naplánované se odešle na pozadí (worker se budí každou minutu). E-maily se neposílají naráz, ale postupně z fronty (announcement_mail),
 * aby se SMTP server nezahltil a restart serveru nic neztratil.
 */
import { all, get, run, tx } from "./db";
import { audit } from "./audit";
import { notify } from "./messages";
import { boardMailTick } from "./board";
import { layout } from "./email-notify";
import { mailConfigured, sendMail } from "./mail";
import { siteUrl } from "./site";
import type { User } from "./session";

export type Audience = { kind: "all" } | { kind: "classes"; ids: number[] } | { kind: "users"; ids: number[] };

export type AnnouncementRow = {
  id: number; created_at: number; send_at: number; title: string; body: string; link: string; silent: number; email: number; audience: string;
  status: "scheduled" | "sent" | "cancelled"; sent_at: number | null; recipients: number; mails_sent: number; mails_total: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Kdo oznámení dostane. Počítá se v okamžiku odeslání, takže se do „všech“ a třídy dostanou i ti, kdo přibyli mezi plánováním a odesláním. */
export function audienceIds(a: Audience): number[] {
  if (a.kind === "all") return all<{ id: number }>("SELECT id FROM users WHERE placeholder = 0").map((r) => r.id);
  const list = [...new Set(a.ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5000);
  if (!list.length) return [];
  const marks = list.map(() => "?").join(",");
  return all<{ id: number }>(a.kind === "classes" ? `SELECT id FROM users WHERE placeholder = 0 AND class_id IN (${marks})` : `SELECT id FROM users WHERE placeholder = 0 AND id IN (${marks})`, ...list).map((r) => r.id);
}

type Input = { title: string; body: string; link: string; silent: boolean; email: boolean; audience: Audience; sendAt: number | null };

/** Uloží oznámení; odeslat se má hned (sendAt prázdné nebo minulé), nebo v zadaný čas. Vrací počet příjemců teď a jestli je naplánované. */
export function createAnnouncement(user: User, v: Input): { count: number; scheduled: boolean; id: number } {
  const now = Date.now();
  const later = v.sendAt != null && v.sendAt > now + 30_000;
  const count = audienceIds(v.audience).length;
  if (!count) throw new Error("V tomhle okruhu nikdo není.");
  const id = Number(
    run(
      "INSERT INTO announcements (created_by, created_at, send_at, title, body, link, silent, email, audience, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')",
      user.id, now, later ? v.sendAt : now, v.title, v.body, v.link, v.silent ? 1 : 0, v.email ? 1 : 0, JSON.stringify(v.audience),
    ).lastInsertRowid,
  );
  const mail = v.email ? ", i e-mailem" : "";
  if (later) {
    audit(user, "announce_schedule", { target: v.title, detail: `naplánováno na ${new Date(v.sendAt!).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}${mail}` });
    return { count, scheduled: true, id };
  }
  const sent = dispatch(id);
  audit(user, "announce", { target: v.title, detail: `${sent} příjemců${v.silent ? ", tiše" : ""}${mail}` });
  void mailQueueTick();
  return { count: sent, scheduled: false, id };
}

/** Rozešle naplánované oznámení (zvonek, push) a případně naplní frontu e-mailů. Každé se odešle nejvýš jednou (status se změní hned na začátku). */
function dispatch(id: number): number {
  const row = get<{ title: string; body: string; link: string; silent: number; email: number; audience: string; status: string }>("SELECT title, body, link, silent, email, audience, status FROM announcements WHERE id = ?", id);
  if (!row || row.status !== "scheduled") return 0;
  if (!run("UPDATE announcements SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'scheduled'", Date.now(), id).changes) return 0;
  const ids = audienceIds(JSON.parse(row.audience) as Audience);
  const key = `announce:${id}`;
  tx(() => {
    ids.forEach((uid) => notify(uid, { category: "system", title: row.title, body: row.body, link: row.link || undefined, key: `${key}:${uid}`, silent: !!row.silent }));
    // kdo má zapnuté e-mailová upozornění, by jinak dostal tutéž zprávu podruhé
    if (row.email) run("UPDATE messages SET emailed_at = ? WHERE key LIKE ? AND emailed_at IS NULL", Date.now(), `${key}:%`);
    if (row.email && ids.length) {
      const marks = ids.map(() => "?").join(",");
      run(`INSERT OR IGNORE INTO announcement_mail (announcement_id, user_id) SELECT ?, id FROM users WHERE id IN (${marks}) AND placeholder = 0 AND demo = 0 AND email NOT LIKE '%@bez-uctu.invalid'`, id, ...ids);
    }
    run("UPDATE announcements SET recipients = ? WHERE id = ?", ids.length, id);
  });
  return ids.length;
}

/** Zrušení ještě neodeslaného oznámení. */
export function cancelAnnouncement(user: User, id: number) {
  const row = get<{ title: string }>("SELECT title FROM announcements WHERE id = ? AND status = 'scheduled'", id);
  if (!row) throw new Error("Oznámení už je odeslané nebo zrušené.");
  run("UPDATE announcements SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'", id);
  audit(user, "announce_cancel", { target: row.title });
}

export function listAnnouncements(limit = 12): AnnouncementRow[] {
  return all<AnnouncementRow>(
    `SELECT a.id, a.created_at, a.send_at, a.title, a.body, a.link, a.silent, a.email, a.audience, a.status, a.sent_at, a.recipients,
            (SELECT COUNT(*) FROM announcement_mail m WHERE m.announcement_id = a.id AND m.sent_at IS NOT NULL) AS mails_sent,
            (SELECT COUNT(*) FROM announcement_mail m WHERE m.announcement_id = a.id) AS mails_total
     FROM announcements a ORDER BY CASE a.status WHEN 'scheduled' THEN 0 ELSE 1 END, CASE a.status WHEN 'scheduled' THEN a.send_at END ASC, a.created_at DESC LIMIT ${Math.floor(limit)}`,
  );
}

function mailFor(a: { title: string; body: string; link: string }, name: string) {
  const url = `${siteUrl()}${a.link && /^\/(?![/\\])/.test(a.link) ? a.link : "/dnes"}`;
  const first = name.split(" ")[0] ?? "";
  const paras = a.body ? a.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : "";
  const html = layout(a.title, `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.55">Ahoj ${esc(first)},</p>${paras}`, "Tuhle zprávu poslal správce Classmate všem uživatelům (nebo jejich části). Je to oznámení k provozu aplikace, ne reklama.", { label: "Otevřít Classmate", url });
  const text = `Ahoj ${first},\n\n${a.title}${a.body ? `\n\n${a.body}` : ""}\n\nOtevřít Classmate: ${url}\n\nTuhle zprávu poslal správce Classmate.`;
  return { subject: a.title, html, text };
}

let sending = false;
/** Pošle dávku e-mailů z fronty (nejvýš ~45 s práce, pak počká na další minutu). Selhání u jedné adresy ostatní nezastaví; po třech neúspěších se adresa vzdá. */
export async function mailQueueTick() {
  if (sending || !mailConfigured()) return;
  sending = true;
  try {
    const stop = Date.now() + 45_000;
    for (;;) {
      const batch = all<{ announcement_id: number; user_id: number; email: string; name: string; title: string; body: string; link: string }>(
        `SELECT m.announcement_id, m.user_id, u.email, u.name, a.title, a.body, a.link FROM announcement_mail m
         JOIN announcements a ON a.id = m.announcement_id JOIN users u ON u.id = m.user_id
         WHERE m.sent_at IS NULL AND m.attempts < 3 ORDER BY m.announcement_id, m.user_id LIMIT 20`,
      );
      if (!batch.length) return;
      for (const r of batch) {
        if (Date.now() > stop) return;
        try {
          await sendMail({ to: r.email, ...mailFor(r, r.name) });
          run("UPDATE announcement_mail SET sent_at = ? WHERE announcement_id = ? AND user_id = ?", Date.now(), r.announcement_id, r.user_id);
        } catch (e) {
          run("UPDATE announcement_mail SET attempts = attempts + 1 WHERE announcement_id = ? AND user_id = ?", r.announcement_id, r.user_id);
          console.error("announcement mail failed for user", r.user_id, e instanceof Error ? e.message : e);
        }
        await new Promise((res) => setTimeout(res, 150)); // zhruba 6 e-mailů za vteřinu
      }
    }
  } finally {
    sending = false;
  }
}

/** Jednou za minutu: odešle naplánovaná oznámení, jejichž čas nastal, a pokračuje ve frontě e-mailů. */
export async function announceTick() {
  for (const r of all<{ id: number }>("SELECT id FROM announcements WHERE status = 'scheduled' AND send_at <= ? ORDER BY send_at LIMIT 20", Date.now())) {
    try {
      dispatch(r.id);
    } catch (e) {
      console.error("scheduled announcement failed", r.id, e);
    }
  }
  await mailQueueTick();
  await boardMailTick();
}
