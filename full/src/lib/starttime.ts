import { addDays, dowOf, mondayOf, pragueNow } from "./dates";
import { buildSlots, fmtMin } from "./schedule";
import { peekTimetable } from "./sync";
import { USER_SELECT, type User } from "./session";
import { get } from "./db";

/**
 * Začátek první hodiny předmětu v daný den ("07:55"), nebo null, když ten den předmět v rozvrhu není.
 * Bere rozvrh z paměti (tento a příští týden, jinak stálý rozvrh); zrušené hodiny se nepočítají.
 */
export function startTimes(user: User): (date: string | null | undefined, subject: string | null | undefined) => string | null {
  const today = pragueNow().date;
  const thisMon = mondayOf(today);
  const nextMon = addDays(thisMon, 7);
  const tt = { this: peekTimetable(user, "this"), next: peekTimetable(user, "next"), perm: peekTimetable(user, "permanent") };
  const cache = new Map<string, ReturnType<typeof buildSlots>>();
  return (date, subject) => {
    if (!date || !subject) return null;
    const dow = dowOf(date);
    if (dow > 5) return null;
    const mon = mondayOf(date);
    const t = mon === thisMon ? tt.this ?? tt.perm : mon === nextMon ? tt.next ?? tt.perm : tt.perm;
    if (!t) return null;
    const key = `${mon === thisMon ? "t" : mon === nextMon ? "n" : "p"}${dow}`;
    let slots = cache.get(key);
    if (!slots) cache.set(key, (slots = buildSlots(t, dow, new Map())));
    const first = slots.find((s) => !s.cancelled && s.subject === subject);
    return first ? fmtMin(first.begin) : null;
  };
}

/**
 * Skončila dnes už poslední (neodpadlá) hodina tohoto předmětu? Platí jen pro dnešek a jen když předmět dnes v rozvrhu je;
 * jinak (jiný den, předmět dnes není, rozvrh nemáme) vrací false, aby se nic neschovalo omylem.
 */
export function lessonsOver(userId: number): (date: string, subject: string) => boolean {
  const now = pragueNow();
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, userId);
  if (!user || now.dow > 5) return () => false;
  const tt = peekTimetable(user, "this") ?? peekTimetable(user, "permanent");
  const slots = tt ? buildSlots(tt, now.dow, new Map()).filter((x) => !x.cancelled) : [];
  return (date, subject) => {
    if (date !== now.date) return false;
    const mine = slots.filter((x) => x.subject === subject);
    return mine.length > 0 && now.minutes >= Math.max(...mine.map((x) => x.end));
  };
}
