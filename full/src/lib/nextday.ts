import { addDays, dowOf } from "./dates";
import { isSelfStudy } from "./selfstudy";
import type { Timetable } from "./types";

export type NextSchoolDay = { date: string; lessons: Timetable["lessons"]; hours: Map<number, { begin: string; end: string }>; /** začátek první hodiny (HH:MM) */ begin?: string };

/** Nejbližší pozdější den se skutečnou výukou (bez zrušených hodin) z rozvrhu tohoto a příštího týdne; při prázdninách delších než týden vrátí null. */
export function nextSchoolDay(today: string, weeks: { monday: string; data: Timetable | null | undefined }[]): NextSchoolDay | null {
  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, i);
    const dow = dowOf(date);
    if (dow > 5) continue;
    const week = weeks.find((w) => date >= w.monday && date <= addDays(w.monday, 6));
    const lessons = (week?.data?.lessons ?? []).filter((l) => l.day === dow).sort((a, b) => a.hour - b.hour);
    const live = lessons.filter((l) => l.change?.kind !== "cancelled");
    if (!live.length) continue;
    const hours = new Map((week?.data?.hours ?? []).map((h) => [h.hour, h]));
    const first = live.find((l) => !isSelfStudy(l.room)) ?? live[0];
    return { date, lessons, hours, begin: hours.get(first.hour)?.begin };
  }
  return null;
}
