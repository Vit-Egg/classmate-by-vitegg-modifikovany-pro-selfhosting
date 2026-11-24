/**
 * Profil spolužáka: všechno, co je o něm a od něj veřejné pro lidi z třídy (jméno, role, skupiny, sdílené poznámky, zadané úkoly, testy a zkoušení a události).
 * Z kontaktů jen sociální sítě, které si uživatel sám vyplnil; žádné další soukromé údaje. Soukromé položky (private) a poznámky mimo čtenářovu skupinu se nezobrazují.
 */
import { classmates, type Classmate } from "./classmates";
import { all, get } from "./db";
import { pragueNow } from "./dates";
import { peekTimetable } from "./sync";
import type { Timetable } from "./types";
import { collabNotesBetween, sharedNotesBy } from "./services";
import type { User } from "./session";
import { getPref } from "./prefs";
import { parseSocials, type Socials } from "./socials";

export type ProfileGroup = { id: number; label: string; wholeClass: boolean; together: boolean; subjects: { name: string; hue: string }[] };
export type ProfileItem = { id: number; title: string; date: string | null; subject: string | null; hue: string | null; group: string | null };

export type ClassmateProfile = {
  mate: Classmate;
  self: boolean;
  since: number;
  socials: Socials;
  /** Rozvrh spolužáka z jeho poslední synchronizace (jen z paměti, nic se nestahuje); null = zatím není načtený. */
  timetables: { this: Timetable | null; next: Timetable | null; permanent: Timetable | null };
  /** spolužák svůj rozvrh nesdílí (vypnuto v jeho nastavení) */
  timetableHidden: boolean;
  groups: ProfileGroup[];
  togetherCount: number;
  sharedNotes: Awaited<ReturnType<typeof sharedNotesBy>>;
  collabNotes: ReturnType<typeof collabNotesBetween>;
  tasks: ProfileItem[];
  tests: ProfileItem[];
  events: { id: number; title: string; date: string; start: string | null }[];
};

/** Profil spolužáka z čtenářovy třídy, nebo null (jiná třída, neexistuje, člen bez účtu). */
export function classmateProfile(viewer: User, id: number): ClassmateProfile | null {
  const row = get<{ id: number; created_at: number; socials: string | null; demo: number; ui_prefs: string | null }>("SELECT id, created_at, socials, demo, ui_prefs FROM users WHERE id = ? AND class_id = ? AND placeholder = 0", id, viewer.class_id);
  if (!row) return null;
  const mate = classmates(viewer.class_id).find((c) => c.id === id);
  if (!mate) return null;
  const today = pragueNow().date;
  const mine = new Set(all<{ group_id: number }>("SELECT group_id FROM user_subjects WHERE user_id = ?", viewer.id).map((r) => r.group_id));

  const byGroup = new Map<number, ProfileGroup>();
  for (const r of all<{ gid: number; label: string; whole: number; sname: string; hue: string }>(
    `SELECT g.id gid, g.label, g.whole_class whole, s.name sname, s.hue
     FROM user_subjects us JOIN groups g ON g.id = us.group_id JOIN subjects s ON s.id = us.subject_id
     WHERE us.user_id = ? ORDER BY g.whole_class, g.label COLLATE NOCASE, s.name COLLATE NOCASE`, id)) {
    const g = byGroup.get(r.gid) ?? { id: r.gid, label: r.label, wholeClass: !!r.whole, together: id !== viewer.id && mine.has(r.gid), subjects: [] };
    g.subjects.push({ name: r.sname, hue: r.hue });
    byGroup.set(r.gid, g);
  }
  // nejdřív skupiny, ve kterých jsme spolu, pak podle počtu předmětů, ve kterých skupina platí
  const groups = [...byGroup.values()].sort((a, b) => Number(b.together) - Number(a.together) || b.subjects.length - a.subjects.length || a.label.localeCompare(b.label, "cs"));

  const scope = "t.class_id = :cls AND t.private = 0 AND t.created_by = :author AND (t.group_id IS NULL OR t.group_id IN (SELECT group_id FROM user_subjects WHERE user_id = :me))";
  const p = { cls: viewer.class_id, author: id, me: viewer.id, today };
  return {
    mate,
    self: id === viewer.id,
    since: row.created_at,
    socials: parseSocials(row.socials),
    timetableHidden: id !== viewer.id && getPref(row, "tt_share") === "0",
    timetables: (() => {
      if (id !== viewer.id && getPref(row, "tt_share") === "0") return { this: null, next: null, permanent: null };
      const u = { id: row.id, demo: row.demo } as User; // peekTimetable potřebuje jen id a příznak dema
      return { this: peekTimetable(u, "this"), next: peekTimetable(u, "next"), permanent: peekTimetable(u, "permanent") };
    })(),
    groups,
    togetherCount: groups.filter((g) => g.together && !g.wholeClass).length,
    sharedNotes: sharedNotesBy(viewer, id),
    collabNotes: id === viewer.id ? [] : collabNotesBetween(viewer.id, id),
    tasks: all<ProfileItem>(
      `SELECT t.id, t.title, t.due_date AS date, s.name AS subject, s.hue, g.label AS "group"
       FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id
       WHERE ${scope} AND (t.due_date IS NULL OR t.due_date >= :today) AND NOT EXISTS (SELECT 1 FROM task_done d WHERE d.task_id = t.id AND d.user_id = :me)
       ORDER BY (t.due_date IS NULL), t.due_date, t.id LIMIT 10`, p),
    tests: all<ProfileItem>(
      `SELECT t.id, t.topic AS title, t.date, s.name AS subject, s.hue, g.label AS "group"
       FROM tests t JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id
       WHERE ${scope} AND t.date >= :today ORDER BY t.date, t.id LIMIT 10`, p),
    events: all<{ id: number; title: string; date: string; start: string | null }>(
      "SELECT id, title, date, start_time AS start FROM custom_events WHERE class_id = ? AND user_id = ? AND private = 0 AND date >= ? ORDER BY date, id LIMIT 10",
      viewer.class_id, id, today),
  };
}
