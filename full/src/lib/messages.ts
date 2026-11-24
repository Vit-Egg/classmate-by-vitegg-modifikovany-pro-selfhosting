/**
 * Zprávy: oznámení o změnách. Vznikají (a) porovnáním nově stažených dat z Bakalářů s předchozí verzí,
 * (b) při zadání úkolu, testu nebo zkoušení spolužákem. Při úplně první synchronizaci se nic nevytváří (jen se uloží základ).
 */
import { all, get, run, tx } from "./db";
import { addDays, dayName, fmtShort, mondayOf, pragueNow } from "./dates";
import { isSelfStudy, roomText } from "./selfstudy";
import { listTests } from "./content";
import { pushMessage, pushRefresh } from "./push";
import { absenceHours, type AbsenceData, type MarksData, type Timetable } from "./types";
import type { User } from "./session";

export type Category = "timetable" | "marks" | "absence" | "classwork" | "komens" | "duty" | "cash" | "notes" | "board" | "system";
export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "timetable", label: "Změny v rozvrhu", hint: "suplování, zrušené hodiny, jiná učebna" },
  { id: "marks", label: "Nové známky", hint: "když ti učitel zapíše známku" },
  { id: "absence", label: "Absence", hint: "nový nebo upravený záznam absence" },
  { id: "komens", label: "Komens a nástěnka", hint: "nová zpráva od učitele nebo školy v Bakalářích" },
  { id: "cash", label: "Pokladna", hint: "platby ve třídě, potvrzení a odmítnutí plateb" },
  { id: "duty", label: "Třídní služby", hint: "kdy máš službu ve třídě" },
  { id: "classwork", label: "Úkoly, testy a zkoušení", hint: "co zadali spolužáci pro tvou třídu nebo skupinu" },
  { id: "notes", label: "Poznámky", hint: "pozvání ke společné úpravě poznámky" },
  { id: "board", label: "Nástěnka třídy", hint: "příspěvky, u kterých autor chtěl upozornit celou třídu" },
];

export type Message = { id: number; category: Category; title: string; body: string; link: string | null; created_at: number; read_at: number | null };
type NewMessage = { category: Category; title: string; body?: string; link?: string; key: string; /** tiché: jen do zvonečku, bez upozornění na zařízení */ silent?: boolean };

export function notify(userId: number, m: NewMessage) {
  const u = get<{ msg_off: string | null; placeholder: number }>("SELECT msg_off, placeholder FROM users WHERE id = ?", userId);
  if (!u || u.placeholder) return; // neregistrovaný člen nemá kam zprávy dostat
  if (u.msg_off && (JSON.parse(u.msg_off) as string[]).includes(m.category)) {
    if (m.category === "timetable") pushRefresh(userId); // zpráva se nevytvoří, ale widget v aplikaci má mít čerstvý rozvrh
    return;
  }
  const at = Date.now();
  // tiché oznámení se rovnou označí jako odeslané, takže se pošle jen do zvonečku, bez upozornění na zařízení ani e-mailu
  const r = run("INSERT OR IGNORE INTO messages (user_id, category, title, body, link, key, created_at, pushed_at, emailed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", userId, m.category, m.title.slice(0, 200), (m.body ?? "").slice(0, 500), m.link ?? null, m.key, at, m.silent ? at : null, m.silent ? at : null);
  if (r.changes && !m.silent) pushMessage(userId);
  // úklid: starší než 60 dní pryč
  run("DELETE FROM messages WHERE user_id = ? AND created_at < ?", userId, Date.now() - 60 * 86_400_000);
}

export const unreadCount = (userId: number) => get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND read_at IS NULL", userId)?.n ?? 0;

export const listMessages = (userId: number, category?: Category, limit = 300) =>
  all<Message>(`SELECT id, category, title, body, link, created_at, read_at FROM messages WHERE user_id = ? ${category ? "AND category = ?" : ""} ORDER BY created_at DESC, id DESC LIMIT ${limit}`, ...(category ? [userId, category] : [userId]));

export function markRead(userId: number, id?: number) {
  if (id) run("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?", Date.now(), id, userId);
  else run("UPDATE messages SET read_at = ? WHERE user_id = ? AND read_at IS NULL", Date.now(), userId);
}

/** Smaže jednu zprávu uživatele, nebo (bez id) všechny. */
export function deleteMessages(userId: number, id?: number) {
  if (id) run("DELETE FROM messages WHERE id = ? AND user_id = ?", id, userId);
  else run("DELETE FROM messages WHERE user_id = ?", userId);
}

export const disabledCategories = (user: Pick<User, "id">): Category[] => {
  const r = get<{ msg_off: string | null }>("SELECT msg_off FROM users WHERE id = ?", user.id);
  return r?.msg_off ? JSON.parse(r.msg_off) : [];
};

export function toggleCategory(userId: number, c: Category) {
  const r = get<{ msg_off: string | null }>("SELECT msg_off FROM users WHERE id = ?", userId);
  const off = new Set<string>(r?.msg_off ? JSON.parse(r.msg_off) : []);
  if (off.has(c)) off.delete(c);
  else off.add(c);
  run("UPDATE users SET msg_off = ? WHERE id = ?", off.size ? JSON.stringify([...off]) : null, userId);
}

/* ---------- detekce změn ---------- */

const TT_LINK = (date: string, today: string) => (date === today ? "/dnes" : date >= addDays(mondayOf(today), 7) ? "/rozvrh?t=pristi" : "/rozvrh");

export function detectTimetable(user: User, monday: string, data: Timetable, prev: Timetable | null) {
  if (!prev) return; // první načtení = jen základ, žádná „nová“ oznámení
  const today = pragueNow().date;
  const sig = (l: Timetable["lessons"][number]) => `${l.day}|${l.hour}|${l.subjectId}|${l.change?.kind}|${l.room}|${l.teacher}`;
  const had = new Set(prev.lessons.filter((l) => l.change).map(sig));
  const hours = new Map(data.hours.map((h) => [h.hour, h]));
  for (const l of data.lessons) {
    if (!l.change || had.has(sig(l))) continue;
    const date = addDays(monday, l.day - 1);
    if (date < today) continue;
    const before = prev.lessons.find((p) => p.day === l.day && p.hour === l.hour && !p.change);
    const subject = l.change.kind === "cancelled" ? before?.subject ?? "Hodina" : l.subject;
    const h = hours.get(l.hour);
    const when = `${dayName(l.day)} ${fmtShort(date)} · ${l.hour}. hodina${h ? ` (${h.begin}–${h.end})` : ""}`;
    let title: string;
    const parts = [when];
    if (l.change.kind === "cancelled") title = `Odpadá: ${subject}`;
    else if (l.change.kind === "substitution") {
      title = `Suplování: ${subject}`;
      parts.push([roomText(l.room), l.teacherName || l.teacher].filter(Boolean).join(" · "));
    } else if (l.change.kind === "room") {
      if (isSelfStudy(l.room)) {
        title = `Samostudium: ${subject}`;
        parts.push(`můžeš být doma${before?.room ? ` (dřív ${before.room})` : ""}`);
      } else {
        title = `Změna učebny: ${subject}`;
        parts.push(`nově ${l.room}${before?.room && before.room !== l.room ? ` (dřív ${before.room})` : ""}`);
      }
    } else title = `Změna v rozvrhu: ${subject}`;
    if (l.change.text) parts.push(l.change.text);
    notify(user.id, { category: "timetable", title, body: parts.filter(Boolean).join(" · "), link: TT_LINK(date, today), key: `tt:${date}:${l.hour}:${l.change.kind}:${l.subjectId}:${l.room}:${l.teacher}` });
  }
}

export function detectMarks(user: User, data: MarksData, prev: MarksData | null) {
  if (!prev) return;
  const had = new Set(prev.subjects.flatMap((s) => s.marks.map((m) => m.id)));
  const fresh = data.subjects.flatMap((s) => s.marks.filter((m) => !had.has(m.id)).map((m) => ({ s, m })));
  if (!fresh.length) return;
  if (fresh.length > 5) {
    notify(user.id, { category: "marks", title: `${fresh.length} nových známek`, body: [...new Set(fresh.map((f) => f.s.name))].join(", "), link: "/znamky", key: `marks:${fresh.map((f) => f.m.id).sort().join(",")}`.slice(0, 200) });
    return;
  }
  for (const { s, m } of fresh) notify(user.id, { category: "marks", title: `Nová známka: ${s.name}: ${m.text}`, body: `${m.caption}${m.weight ? ` · váha ${m.weight}` : ""}`, link: "/znamky", key: `mark:${m.id}` });
}

export function detectAbsence(user: User, data: AbsenceData, prev: AbsenceData | null) {
  if (!prev) return;
  const sig = (d: AbsenceData["days"][number]) => `${d.date}|${d.missed}|${d.excused}|${d.unsolved}|${d.late}|${d.soon}|${d.school}`;
  const had = new Set(prev.days.map(sig));
  const hadDate = new Set(prev.days.map((d) => d.date));
  const prevHours = new Map(prev.days.map((d) => [d.date, absenceHours(d)]));
  const today = pragueNow().date;
  for (const d of data.days) {
    if (had.has(sig(d))) continue;
    // nová absence v den, kdy se psal test: upozorni, o jaký test šlo (Bakaláři neříkají, které hodiny chyběly, proto „možná“)
    if (d.date <= today && absenceHours(d) > (prevHours.get(d.date) ?? 0)) {
      for (const t of listTests(user.id, user.class_id, d.date, d.date, { raw: true })) {
        notify(user.id, {
          category: "absence",
          title: `Zameškaný test nebo zkoušení: ${t.subject_name}`,
          body: `${fmtShort(t.date)}${t.topic ? ` · ${t.topic}` : ""} · v ten den máš zapsanou absenci (${absenceHours(d)} hod.), test nebo zkoušení jsi možná nepsal(a). Domluv si náhradní termín.`,
          link: "/testy-a-zkouseni",
          key: `missedtest:${t.id}`,
        });
      }
    }
    const bits = [absenceHours(d) ? `${absenceHours(d)} hod.` : "", d.excused ? `omluveno ${d.excused}` : "", d.unsolved ? `nevyřízeno ${d.unsolved}` : "", d.late ? `pozdě ${d.late}` : "", d.soon ? `odchod ${d.soon}` : ""].filter(Boolean);
    notify(user.id, { category: "absence", title: hadDate.has(d.date) ? `Absence upravena: ${fmtShort(d.date)}` : `Nová absence: ${fmtShort(d.date)}`, body: bits.join(" · "), link: "/absence", key: `abs:${sig(d)}` });
  }
}

/** Úkol, test nebo zkoušení zadal spolužák → upozorni ostatní, kteří ho uvidí (celá třída, nebo jen daná skupina). */
export function notifyClassmates(author: User, groupId: number | null, m: Omit<NewMessage, "key"> & { key: string }) {
  const recipients = all<{ id: number }>(
    `SELECT u.id FROM users u WHERE u.class_id = ? AND u.id != ? AND (? IS NULL OR u.id IN (SELECT user_id FROM user_subjects WHERE group_id = ?))`,
    author.class_id, author.id, groupId, groupId,
  );
  tx(() => recipients.forEach((r) => notify(r.id, m)));
}
