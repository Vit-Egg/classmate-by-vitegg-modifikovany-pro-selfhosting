/** Data widgetů odlehčené verze: jen z cache (Bakaláře se kvůli widgetu nevolají), obědy z paměti Strava.cz s krátkým časovým limitem. */
import { addDays, dowOf, mondayOf, pragueNow } from "./dates";
import { peek, ttKey, weekStart, type KomensMessage } from "./bk";
import { ME } from "./db";
import { isLunch, stravaAccount, stravaMenu } from "./strava";
import { absenceHours, type AbsenceData, type MarksData, type Timetable } from "./types";
import type { EDay, RenderInput } from "./embed/core";

export const LITE_WIDGETS = ["rozvrh", "suplovani", "znamky", "prumery", "absence", "komens", "obedy"];

/** Hodiny jednoho dne z rozvrhu (při víc záznamech v hodině vyhrává ten nezrušený). */
export function dayLessons(tt: Timetable, dow: number) {
  const hours = new Map(tt.hours.map((h) => [h.hour, h]));
  const byHour = new Map<number, EDay["lessons"][number]>();
  for (const l of tt.lessons.filter((x) => x.day === dow).sort((a, b) => a.hour - b.hour)) {
    const h = hours.get(l.hour);
    const cancelled = l.change?.kind === "cancelled";
    const prev = byHour.get(l.hour);
    if (prev && !prev.cancelled) continue;
    byHour.set(l.hour, { hour: l.hour, subject: l.subject, begin: h?.begin ?? "", end: h?.end ?? "", room: l.room || undefined, teacher: l.teacherName || l.teacher || undefined, cancelled, change: l.change ? [l.change.label, l.change.text].filter(Boolean).join(" · ") : null });
  }
  return [...byHour.values()];
}

export function upcomingDays(count: number, skipFinishedToday = true): EDay[] {
  const now = pragueNow();
  const weeks = new Map<string, Timetable | undefined>([weekStart("this"), weekStart("next"), mondayOf(now.date)].map((m) => [m, peek<Timetable>(ttKey(m))?.data]));
  const out: EDay[] = [];
  for (let i = 0; i < 16 && out.length < count; i++) {
    const date = addDays(now.date, i);
    const dow = dowOf(date);
    if (dow > 5) continue;
    const tt = weeks.get(mondayOf(date));
    if (!tt) continue;
    const lessons = dayLessons(tt, dow);
    if (i === 0 && skipFinishedToday && lessons.length) {
      const [h, m] = (lessons[lessons.length - 1].end || "00:00").split(":").map(Number);
      if (h * 60 + m < now.minutes) continue;
    }
    out.push({ date, lessons, note: tt.days.find((d) => d.day === dow)?.description || undefined });
  }
  return out;
}

export async function lunchDays(today: string) {
  if (!stravaAccount(ME)) return null;
  try {
    const r = await Promise.race([stravaMenu(ME), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
    return r.days.filter((d) => !d.closed && d.date >= today && d.meals.some(isLunch)).slice(0, 3).map((d) => ({ date: d.date, meals: d.meals.filter(isLunch).map((m) => ({ kind: m.soup ? "Polévka" : m.label, name: m.name, ordered: m.ordered })) }));
  } catch {
    return [];
  }
}

export async function widgetData(id: string): Promise<RenderInput | null> {
  const today = pragueNow().date;
  switch (id) {
    case "rozvrh":
      return { id, days: upcomingDays(2), today };
    case "suplovani":
      return { id, days: upcomingDays(10, false), today };
    case "znamky": {
      const m = peek<MarksData>("marks")?.data;
      const list = (m?.subjects ?? [])
        .flatMap((s) => s.marks.map((x) => ({ subject: s.name, value: x.text || (x.value == null ? "" : String(x.value)), caption: x.caption || x.theme, weight: x.weight, date: x.date, isNew: x.isNew })))
        .filter((x) => x.value)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { id, marks: list };
    }
    case "prumery": {
      const m = peek<MarksData>("marks")?.data;
      return { id, averages: (m?.subjects ?? []).filter((s) => s.marks.length).map((s) => ({ subject: s.name, average: s.averageText, marks: s.marks.length })) };
    }
    case "absence": {
      const a = peek<AbsenceData>("absence")?.data;
      if (!a) return { id, absence: null };
      const sum = (k: "missed" | "excused" | "unsolved" | "late") => a.days.reduce((n, d) => n + d[k], 0);
      return { id, absence: { total: a.days.reduce((n, d) => n + absenceHours(d), 0), excused: sum("excused"), unsolved: sum("unsolved"), missed: sum("missed"), late: sum("late"), threshold: a.threshold, subjects: a.subjects.map((s) => ({ name: s.name, lessons: s.lessons, missed: s.missed })) } };
    }
    case "komens": {
      const list = peek<KomensMessage[]>("komens:received")?.data ?? [];
      return { id, messages: list.map((m) => ({ title: m.title, sender: m.sender, date: m.sentAt, read: m.read })) };
    }
    case "obedy":
      return { id, lunch: await lunchDays(today), today };
  }
  return null;
}
