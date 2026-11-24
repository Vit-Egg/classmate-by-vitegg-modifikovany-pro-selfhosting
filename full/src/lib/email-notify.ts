/**
 * E-mailová upozornění: stejné zprávy jako ve zvonečku, jen doručené poštou.
 * - Jen na potvrzenou adresu (uživatel klikne na odkaz v e-mailu), aby se nedalo spamovat cizí adresy.
 * - Režim „instant“ pošle zprávy do pár minut (v nočním klidu počká do rána), „digest“ jednou denně v 7:00.
 * - Zprávy, které uživatel už přečetl v aplikaci, se neposílají.
 */
import { all, get, rateLimit, run } from "./db";
import { pragueNow } from "./dates";
import { mailConfigured, sendMail } from "./mail";
import { signToken } from "./mail-tokens";
import { quiet } from "./push";
import { siteUrl } from "./site";
import type { User } from "./session";

type Pending = { id: number; title: string; body: string; link: string | null; created_at: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unsubUrl = (userId: number) => `${siteUrl()}/odhlasit-email?t=${signToken({ p: "unsub", u: userId }, 2 * 365 * 86_400_000)}`;

/** Společný vzhled všech e-mailů Classmate. */
export function layout(heading: string, inner: string, footer: string, cta: { label: string; url: string } | null = { label: "Otevřít Classmate", url: `${siteUrl()}/dnes` }) {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f4f2ee;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#16181b">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="padding:0 8px 16px"><img src="${siteUrl()}/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:10px;margin-right:10px"><span style="font-size:26px;font-weight:800;letter-spacing:-0.04em;vertical-align:middle">Classmate</span></div>
<div style="background:#fff;border-radius:24px;padding:28px;border:1px solid #e7e4de">
<h1 style="margin:0 0 18px;font-size:21px;letter-spacing:-0.02em">${esc(heading)}</h1>${inner}
${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:22px;background:#15181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${esc(cta.label)}</a>` : ""}
</div><p style="color:#6b6f76;font-size:12.5px;line-height:1.5;padding:0 8px">${footer}</p></div></body></html>`;
}

function footerFor(userId: number) {
  return `Tohle upozornění dostáváš, protože sis zapnul(a) e-maily v Classmate. <a href="${siteUrl()}/nastaveni" style="color:#6b6f76">Změnit nastavení</a> nebo <a href="${unsubUrl(userId)}" style="color:#6b6f76">odhlásit odběr</a>.`;
}

function digestMail(user: User, list: Pending[], digest: boolean) {
  const link = (m: Pending) => `${siteUrl()}${m.link && /^\/(?![/\\])/.test(m.link) ? m.link : "/dnes"}`;
  const one = list.length === 1;
  const subject = digest ? `Classmate: co je nového (${list.length})` : one ? list[0].title : `Classmate: ${list.length} nová oznámení`;
  const heading = digest ? "Co je nového v Classmate" : one ? "Nové oznámení" : `${list.length} nová oznámení`;
  const items = list
    .map((m) => `<div style="padding:12px 0;border-top:1px solid #eeebe5"><a href="${link(m)}" style="color:#16181b;text-decoration:none;font-weight:650;font-size:15.5px">${esc(m.title)}</a>${m.body ? `<div style="color:#6b6f76;font-size:14px;margin-top:3px;line-height:1.45">${esc(m.body)}</div>` : ""}</div>`)
    .join("");
  const text = [`${heading}`, "", ...list.map((m) => `• ${m.title}${m.body ? `\n  ${m.body}` : ""}\n  ${link(m)}`), "", `Otevřít Classmate: ${siteUrl()}/dnes`, "", `Odhlásit odběr: ${unsubUrl(user.id)}`].join("\n");
  return { subject, text, html: layout(heading, items, footerFor(user.id)), unsubscribeUrl: unsubUrl(user.id) };
}

/** Pošle uživateli odkaz na potvrzení adresy. */
export async function sendConfirmation(user: Pick<User, "id" | "email" | "name">) {
  const url = `${siteUrl()}/potvrdit-email?t=${signToken({ p: "confirm", u: user.id, e: user.email }, 7 * 86_400_000)}`;
  const inner = `<p style="margin:0 0 6px;font-size:15.5px;line-height:1.5">Ahoj ${esc(user.name.split(" ")[0])}, v Classmate sis zapnul(a) e-mailová upozornění. Potvrď prosím, že tahle adresa je tvoje.</p>
<a href="${url}" style="display:inline-block;margin-top:14px;background:#15181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Potvrdit e-mail</a>
<p style="color:#6b6f76;font-size:13.5px;margin:18px 0 0">Odkaz platí 7 dní. Pokud jsi nic nezapínal(a), můžeš tenhle e-mail ignorovat, nic se nestane.</p>`;
  await sendMail({
    to: user.email,
    subject: "Classmate: potvrď svůj e-mail",
    text: `Ahoj, v Classmate sis zapnul(a) e-mailová upozornění. Potvrď, že tahle adresa je tvoje:\n${url}\n\nOdkaz platí 7 dní. Pokud jsi nic nezapínal(a), e-mail ignoruj.`,
    html: layout("Potvrď svůj e-mail", inner, "Tenhle e-mail jsme poslali, protože ho někdo zadal v Classmate. Bez potvrzení se žádná upozornění posílat nebudou."),
  });
}

export type SetResult = { error?: string; pending?: boolean };

/** Změní režim upozornění. Když adresa ještě není potvrzená, pošle potvrzovací e-mail. */
export async function setEmailMode(user: User, mode: unknown): Promise<SetResult> {
  if (mode !== "off" && mode !== "instant" && mode !== "digest") return { error: "Vyber, jak často chceš e-maily dostávat." };
  if (mode === "off") {
    run("UPDATE users SET email_notify = 'off' WHERE id = ?", user.id);
    return {};
  }
  if (!mailConfigured()) return { error: "E-maily zatím na serveru nejsou zapnuté. Napiš správci." };
  const confirmed = user.email_confirmed_for === user.email;
  // co už je ve zvonečku, se zpětně mailem nepošle
  if (user.email_notify === "off") run("UPDATE messages SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL", Date.now(), user.id);
  run("UPDATE users SET email_notify = ? WHERE id = ?", mode, user.id);
  if (confirmed) return {};
  return resendConfirmation(user);
}

export async function resendConfirmation(user: User): Promise<SetResult> {
  if (!mailConfigured()) return { error: "E-maily zatím na serveru nejsou zapnuté." };
  if (!rateLimit(`email:confirm:${user.id}`, 4, 3600)) return { error: "Potvrzení jsi už poslal(a) několikrát. Zkus to za hodinu." };
  try {
    await sendConfirmation(user);
  } catch (e) {
    console.error("confirmation mail failed", e);
    return { error: "E-mail se nepodařilo odeslat. Zkontroluj adresu, nebo to zkus později." };
  }
  return { pending: true };
}

/** Potvrdí adresu z odkazu v e-mailu. Vrací jméno uživatele, nebo null, když je odkaz neplatný. */
export function confirmEmail(userId: number, email: string) {
  const u = get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
  if (!u || u.email !== email) return false;
  run("UPDATE users SET email_confirmed_for = ? WHERE id = ?", email, userId);
  run("UPDATE messages SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL", Date.now(), userId);
  return true;
}

export const unsubscribeEmail = (userId: number) => void run("UPDATE users SET email_notify = 'off' WHERE id = ?", userId);

/* ---------- odesílání na pozadí ---------- */

const failedAt = new Map<number, number>();
const sentToday = new Map<number, { day: string; n: number }>();
const MAX_PER_DAY = 12;

async function deliver(user: User, list: Pending[], digest: boolean) {
  const mail = digestMail(user, list, digest);
  await sendMail({ to: user.email, ...mail });
  const ids = list.map((m) => m.id);
  run(`UPDATE messages SET emailed_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, Date.now(), ...ids);
}

/** Jeden průchod: pošle, co je potřeba. Chyba u jednoho uživatele ostatní nezastaví. */
export async function emailTick(now = new Date()) {
  if (!mailConfigured()) return;
  const clock = pragueNow(now);
  const users = all<User>(`SELECT u.id, u.email, u.name, u.role, u.email_notify, u.email_confirmed_for, u.email_digest_on FROM users u WHERE u.email_notify != 'off' AND u.email_confirmed_for = u.email`);
  for (const user of users) {
    try {
      // přečtené nebo staré zprávy se neposílají
      run("UPDATE messages SET emailed_at = ? WHERE user_id = ? AND emailed_at IS NULL AND (read_at IS NOT NULL OR created_at < ?)", now.getTime(), user.id, now.getTime() - 86_400_000);
      const pending = all<Pending>("SELECT id, title, body, link, created_at FROM messages WHERE user_id = ? AND emailed_at IS NULL ORDER BY created_at", user.id);
      if (user.email_notify === "digest") {
        const done = (user as unknown as { email_digest_on: string | null }).email_digest_on === clock.date;
        if (done || clock.hour < 7) continue; // jednou denně, od sedmi ráno
        if (pending.length) await deliver(user, pending, true);
        run("UPDATE users SET email_digest_on = ? WHERE id = ?", clock.date, user.id);
        continue;
      }
      if (!pending.length || quiet()) continue;
      if (now.getTime() - Math.max(...pending.map((m) => m.created_at)) < 90_000) continue; // počkáme, jestli nepřijde další, ať se pošle jeden e-mail
      if (now.getTime() - (failedAt.get(user.id) ?? 0) < 10 * 60_000) continue;
      const day = sentToday.get(user.id);
      const cur = day && day.day === clock.date ? day : { day: clock.date, n: 0 };
      if (cur.n >= MAX_PER_DAY) continue;
      await deliver(user, pending, false);
      sentToday.set(user.id, { day: clock.date, n: cur.n + 1 });
    } catch (e) {
      failedAt.set(user.id, now.getTime());
      console.error("email notification failed for user", user.id, e);
    }
  }
}
