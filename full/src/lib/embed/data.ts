/** Data widgetů plné verze: čte jen z paměti serveru (cache Bakalářů, databáze), Bakaláře kvůli widgetu nevolá. */
import { get } from "../db";
import { addDays, dowOf, mondayOf, pragueNow } from "../dates";
import { listTasks, listTests, subjectHues } from "../content";
import { buildSlots, fmtMin } from "../schedule";
import { peekAbsence, peekMarks, peekTimetable } from "../sync";
import { stravaAccount, stravaMenu, isLunch } from "../strava";
import { USER_SELECT, type User } from "../session";
import { absenceHours, type Timetable } from "../types";
import type { KomensMessage } from "../komens";
import type { EDay, RenderInput } from "./types";

/** Verze pro jednoho člověka: widgety patří vlastníkovi serveru (první správce). */
export const owner = () => get<User>(`${USER_SELECT} WHERE u.role = 'admin' AND u.demo = 0 ORDER BY u.id LIMIT 1`) ?? null;

export const FULL_WIDGETS = ["rozvrh", "suplovani", "znamky", "prumery", "absence", "komens", "obedy", "ukoly", "testy"];

function schoolDays(user: User, today: string, count: number): EDay[] {
  const thisMon = mondayOf(today);
  const weeks: Record<string, Timetable | null> = { [thisMon]: peekTimetable(user, "this"), [addDays(thisMon, 7)]: peekTimetable(user, "next") };
  const hues = subjectHues(user.class_id);
  const out: EDay[] = [];
  // po skončení vyučování ukaž rovnou zítřek
  const now = pragueNow();
  for (let i = 0; i < 14 && out.length < count; i++) {
    const date = addDays(today, i);
    const dow = dowOf(date);
    if (dow > 5) continue;
    const tt = weeks[mondayOf(date)];
    if (!tt) continue;
    const slots = buildSlots(tt, dow, hues);
    if (i === 0 && slots.length && slots[slots.length - 1].end < now.minutes && count <= 2) continue;
    out.push({
      date,
      note: tt.days.find((d) => d.day === dow)?.description || undefined,
      lessons: slots.map((s) => ({ hour: s.hour, subject: s.subject, hue: s.hue, begin: fmtMin(s.begin), end: fmtMin(s.end), room: s.room, teacher: s.teacher, cancelled: s.cancelled, change: s.change ?? null })),
    });
  }
  return out;
}

export async function widgetData(id: string): Promise<RenderInput | null> {
  const user = owner();
  if (!user) return null;
  const today = pragueNow().date;
  switch (id) {
    case "rozvrh":
      return { id, days: schoolDays(user, today, 2), today };
    case "suplovani":
      return { id, days: schoolDays(user, today, 10), today };
    case "znamky": {
      const m = peekMarks(user);
      const marks = (m?.subjects ?? [])
        .flatMap((s) => s.marks.map((x) => ({ subject: s.name, value: x.text || (x.value == null ? "" : String(x.value)), caption: x.caption || x.theme, weight: x.weight, date: x.date, isNew: x.isNew })))
        .filter((x) => x.value)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { id, marks };
    }
    case "prumery": {
      const m = peekMarks(user);
      return { id, averages: (m?.subjects ?? []).filter((s) => s.marks.length).map((s) => ({ subject: s.name, average: s.averageText, marks: s.marks.length })) };
    }
    case "absence": {
      const a = peekAbsence(user);
      if (!a) return { id, absence: null };
      const sum = (k: "missed" | "excused" | "unsolved" | "late") => a.days.reduce((n, d) => n + d[k], 0);
      return { id, absence: { total: a.days.reduce((n, d) => n + absenceHours(d), 0), excused: sum("excused"), unsolved: sum("unsolved"), missed: sum("missed"), late: sum("late"), threshold: a.threshold, subjects: a.subjects.map((s) => ({ name: s.name, lessons: s.lessons, missed: s.missed })) } };
    }
    case "komens": {
      const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'komens:received'", user.id);
      const list: KomensMessage[] = row ? JSON.parse(row.json) : [];
      return { id, messages: list.map((m) => ({ title: m.title, sender: m.sender, date: m.sentAt, read: m.read })) };
    }
    case "obedy": {
      if (!stravaAccount(user.id)) return { id, lunch: null, today };
      try {
        const r = await Promise.race([stravaMenu(user.id), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
        const lunch = r.days.filter((d) => !d.closed && d.date >= today && d.meals.some(isLunch)).slice(0, 3).map((d) => ({ date: d.date, meals: d.meals.filter(isLunch).map((m) => ({ kind: m.soup ? "Polévka" : m.label, name: m.name, ordered: m.ordered })) }));
        return { id, lunch, today };
      } catch {
        return { id, lunch: [], today };
      }
    }
    case "ukoly":
      return { id, tasks: listTasks(user.id, user.class_id, false).map((t) => ({ title: t.title, subject: t.subject_name ?? undefined, due: t.due_date, hue: t.hue ?? undefined })), today };
    case "testy":
      return { id, tests: listTests(user.id, user.class_id, today, addDays(today, 30)).map((t) => ({ subject: t.subject_name, topic: t.topic ?? undefined, date: t.date, hue: t.hue ?? undefined })), today };
  }
  return null;
}
