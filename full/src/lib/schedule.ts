import { isSelfStudy } from "./selfstudy";
import type { Timetable } from "./types";

export type Slot = { hour: number; begin: number; end: number; subject: string; hue: string; cancelled: boolean; room?: string; teacher?: string; change?: string; /** samostudium (učebna SamS): student může být doma */ selfStudy?: boolean; /** klíč hodiny pro odkaz do rozvrhu (den-hodina-pořadí) */ open?: string };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Hodiny jednoho dne (z rozvrhu, bez sítě). Při souběhu dvou hodin vyhrává ta, která neodpadá. */
export function buildSlots(tt: Timetable | null, dow: number, hues: Map<string, string>): Slot[] {
  if (!tt) return [];
  const hours = new Map(tt.hours.map((h) => [h.hour, h]));
  const byHour = new Map<number, Slot>();
  const today = tt.lessons.filter((x) => x.day === dow);
  for (const l of today) {
    const h = hours.get(l.hour);
    if (!h) continue;
    const cancelled = l.change?.kind === "cancelled";
    if (byHour.get(l.hour) && !byHour.get(l.hour)!.cancelled) continue;
    byHour.set(l.hour, { hour: l.hour, begin: toMin(h.begin), end: toMin(h.end), subject: l.subject, hue: hues.get(l.subjectId) ?? "gray", cancelled, room: l.room || undefined, teacher: l.teacher || undefined, change: l.change?.label, selfStudy: isSelfStudy(l.room) && !cancelled, open: `${dow}-${l.hour}-${today.filter((x) => x.hour === l.hour).indexOf(l)}` });
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

export type DayState =
  | { kind: "none" }
  /** celý den je samostudium, ve škole být nemusíš */
  | { kind: "home"; slots: Slot[] }
  /** `home` je právě běžící samostudium před první hodinou, kterou je potřeba být ve škole */
  | { kind: "before"; first: Slot; last: Slot; minutes: number; secs: number; home?: Slot }
  | { kind: "in"; slot: Slot; last: Slot; left: number; secs: number; progress: number }
  | { kind: "break"; next: Slot; last: Slot; minutes: number; secs: number }
  | { kind: "after"; last: Slot };

/**
 * Stav dne. Začátek a konec „ve škole“ se počítá jen z hodin, kde být musíš (bez samostudia),
 * takže ranní nebo poslední samostudium nepředstírá, že máš být ve škole.
 */
export function dayState(slots: Slot[], nowMin: number): DayState {
  const active = slots.filter((s) => !s.cancelled);
  if (!active.length) return { kind: "none" };
  const school = active.filter((s) => !s.selfStudy);
  if (!school.length) return { kind: "home", slots: active };
  const first = school[0];
  const last = school[school.length - 1];
  // vše se počítá v celých vteřinách: s desetinnými minutami by Math.ceil kvůli zaokrouhlení občas vyšel o vteřinu vedle a text by přeskakoval
  const now = Math.round(nowMin * 60);
  const at = (m: number) => Math.round(m * 60);
  const secsTo = (m: number) => at(m) - now;
  const minsTo = (m: number) => Math.ceil(secsTo(m) / 60);
  if (now < at(first.begin)) return { kind: "before", first, last, minutes: minsTo(first.begin), secs: secsTo(first.begin), home: active.find((s) => s.selfStudy && now >= at(s.begin) && now < at(s.end)) };
  if (now >= at(last.end)) return { kind: "after", last };
  const cur = active.find((s) => now >= at(s.begin) && now < at(s.end));
  if (cur) return { kind: "in", slot: cur, last, left: minsTo(cur.end), secs: secsTo(cur.end), progress: (now - at(cur.begin)) / (at(cur.end) - at(cur.begin)) };
  const next = active.find((s) => at(s.begin) > now)!;
  return { kind: "break", next, last, minutes: minsTo(next.begin), secs: secsTo(next.begin) };
}

export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
