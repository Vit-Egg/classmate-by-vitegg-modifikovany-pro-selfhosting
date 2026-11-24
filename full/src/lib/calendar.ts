/** Kalendář: sbírá všechno s datem z celé aplikace do jednoho seznamu. */
import { all } from "./db";
import { isSelfStudy, roomText } from "./selfstudy";
import { credit } from "./credit";
import { addDays, dayName, mondayOf, pragueNow } from "./dates";
import { listTests, tasksDue } from "./content";
import { getAbsence, getMarks, getTimetable, getTimetableWeek } from "./sync";
import { absenceHours } from "./types";
import type { User } from "./session";

export type CalKind = "test" | "task" | "change" | "event" | "other" | "mark" | "absence";
export type CalEvent = { /** id vlastní události (jen u druhu „other“) */ id?: number; /** smí ji přihlášený upravit (autor nebo správce) */ editable?: boolean; note?: string; start?: string; end?: string; date: string; kind: CalKind; title: string; sub?: string; href: string; time?: string; done?: boolean; cancelled?: boolean; /** už proběhlo (zobrazí se vyšedle) */ past?: boolean };

export const KINDS: { id: CalKind; label: string }[] = [
  { id: "test", label: "Testy a zkoušení" },
  { id: "task", label: "Úkoly" },
  { id: "change", label: "Změny v rozvrhu" },
  { id: "event", label: "Události a svátky" },
  { id: "other", label: "Ostatní" },
  { id: "mark", label: "Známky" },
  { id: "absence", label: "Absence" },
];
export const ALL_KINDS = KINDS.map((k) => k.id);
const ORDER: Record<CalKind, number> = { event: 0, test: 1, change: 2, other: 3, task: 4, absence: 5, mark: 6 };

/** Z Bakalářů se stahují jen týdny v rozumném okolí dneška (každý týden je jeden dotaz, výsledky se cachují). */
const PAST_DAYS = 70;
const FUTURE_DAYS = 150;

const canEdit = (t: { created_by: number | null; private?: number }, user: User) => t.created_by === user.id || (user.role === "admin" && !t.private);

/** Odkaz na rozvrh s rozkliknutou konkrétní hodinou (to umí jen tento a příští týden). */
function lessonLink(lessons: { day: number; hour: number }[], l: { day: number; hour: number }, monday: string, today: string) {
  const thisMonday = mondayOf(today);
  const idx = lessons.filter((x) => x.day === l.day && x.hour === l.hour).indexOf(l);
  const open = `open=${l.day}-${l.hour}-${Math.max(idx, 0)}`;
  if (monday === thisMonday) return `/rozvrh?${open}`;
  if (monday === addDays(thisMonday, 7)) return `/rozvrh?t=pristi&${open}`;
  return "/rozvrh";
}

export async function calendarEvents(user: User, from: string, to: string, kinds: Set<CalKind>) {
  const today = pragueNow().date;
  const out: CalEvent[] = [];
  let partial = false;

  // minulé testy, zkoušení i úkoly zůstávají v kalendáři (raw = bez schovávání těch, jejichž hodina dnes už skončila); minulé vedou do historie
  if (kinds.has("test")) {
    for (const t of listTests(user.id, user.class_id, from, to, { raw: true })) out.push({ date: t.date, kind: "test", title: `${t.oral ? "Zkoušení" : "Test"}: ${t.subject_name}`, sub: [t.makeup ? "Náhradní termín" : "", t.topic, t.group_label, credit(t, user.id).text].filter(Boolean).join(" · ") || undefined, href: t.date < today ? "/testy-a-zkouseni?v=historie" : canEdit(t, user) ? `/testy-a-zkouseni?edit=${t.id}` : "/testy-a-zkouseni", past: t.date < today });
  }
  if (kinds.has("task")) {
    for (const t of tasksDue(user.id, user.class_id, from, to)) out.push({ date: t.due_date!, kind: "task", title: t.title, sub: [t.subject_name, t.group_label, credit(t, user.id).text].filter(Boolean).join(" · ") || undefined, href: t.due_date! < today ? "/ukoly?v=historie" : canEdit(t, user) ? `/ukoly?${t.done ? "v=hotove&" : ""}edit=${t.id}` : "/ukoly", done: !!t.done, past: t.due_date! < today });
  }

  if (kinds.has("change") || kinds.has("event")) {
    const weeks: string[] = [];
    for (let m = mondayOf(from); m <= to && weeks.length < 8; m = addDays(m, 7)) {
      if (m >= addDays(today, -PAST_DAYS) && m <= addDays(today, FUTURE_DAYS)) weeks.push(m);
    }
    const perm = kinds.has("change") ? (await getTimetable(user, "permanent")).data : null;
    const results = await Promise.all(weeks.map((m) => getTimetableWeek(user, m).then((r) => [m, r] as const)));
    for (const [monday, r] of results) {
      if (!r.data) {
        partial = true;
        continue;
      }
      const hours = new Map(r.data.hours.map((h) => [h.hour, h]));
      for (const d of r.data.days) {
        const date = d.date ?? addDays(monday, d.day - 1);
        if (kinds.has("event") && d.description && date >= from && date <= to) out.push({ date, kind: "event", title: d.description, href: "/rozvrh" });
      }
      if (kinds.has("change"))
        for (const l of r.data.lessons) {
          if (!l.change) continue;
          const date = addDays(monday, l.day - 1);
          if (date < from || date > to) continue;
          const original = perm?.lessons.find((p) => p.day === l.day && p.hour === l.hour)?.subject;
          const subject = l.change.kind === "cancelled" ? original ?? "Hodina" : l.subject;
          const h = hours.get(l.hour);
          const title = l.change.kind === "cancelled" ? `Odpadá: ${subject}` : l.change.kind === "substitution" ? `Suplování: ${subject}` : l.change.kind === "room" ? (isSelfStudy(l.room) ? `Samostudium: ${subject}` : `Změna učebny: ${subject}`) : `Změna: ${subject}`;
          const sub = [`${l.hour}. hodina`, l.change.kind === "room" || l.change.kind === "substitution" ? [roomText(l.room), l.teacherName || l.teacher].filter(Boolean).join(" · ") : "", l.change.text].filter(Boolean).join(" · ");
          out.push({ date, kind: "change", title, sub, time: h ? `${h.begin}–${h.end}` : undefined, href: lessonLink(r.data.lessons, l, monday, today), cancelled: l.change.kind === "cancelled" });
        }
    }
  }

  if (kinds.has("other")) {
    for (const e of all<{ id: number; date: string; title: string; start_time: string | null; end_time: string | null; note: string; user_id: number; private: number; author: string; updated_by: number | null; editor: string | null }>(
      "SELECT e.id, e.date, e.title, e.start_time, e.end_time, e.note, e.user_id, e.private, u.name AS author, e.updated_by, uu.name AS editor FROM custom_events e JOIN users u ON u.id = e.user_id LEFT JOIN users uu ON uu.id = e.updated_by WHERE e.class_id = ? AND (e.private = 0 OR e.user_id = ?) AND e.date BETWEEN ? AND ?",
      user.class_id, user.id, from, to,
    ))
      out.push({
        id: e.id, date: e.date, kind: "other", title: e.title,
        sub: [e.note, credit({ author: e.author, created_by: e.user_id, private: e.private, updated_by: e.updated_by, editor: e.editor }, user.id).text].filter(Boolean).join(" · ") || undefined,
        note: e.note, start: e.start_time ?? undefined, end: e.end_time ?? undefined,
        time: e.start_time ? (e.end_time ? `${e.start_time}–${e.end_time}` : e.start_time) : undefined,
        href: "/kalendar", editable: canEdit({ created_by: e.user_id, private: e.private }, user),
      });
  }

  if (kinds.has("mark")) {
    const r = await getMarks(user);
    if (!r.data) partial = true;
    for (const s of r.data?.subjects ?? []) for (const m of s.marks) if (m.date >= from && m.date <= to) out.push({ date: m.date, kind: "mark", title: `${s.name}: ${m.text}`, sub: `${m.caption}${m.weight ? ` · váha ${m.weight}` : ""}`, href: "/znamky" });
  }
  if (kinds.has("absence")) {
    const r = await getAbsence(user);
    if (!r.data) partial = true;
    for (const d of r.data?.days ?? []) if (d.date >= from && d.date <= to) out.push({ date: d.date, kind: "absence", title: absenceHours(d) ? `Absence · ${absenceHours(d)} hod.` : "Absence", sub: [d.excused ? `omluveno ${d.excused}` : "", d.unsolved ? `nevyřízeno ${d.unsolved}` : "", d.late ? `pozdě ${d.late}` : "", d.soon ? `odchod ${d.soon}` : ""].filter(Boolean).join(" · ") || undefined, href: "/absence" });
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title, "cs"));
  return { events: out, partial };
}

export { dayName };
