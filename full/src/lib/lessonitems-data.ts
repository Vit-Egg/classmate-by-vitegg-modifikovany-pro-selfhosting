/** Testy, zkoušení a úkoly pro štítky u hodin (rozvrh, Dnes). Jen na serveru, čte databázi. */
import { listTasks, listTests } from "./content";
import type { LessonItem, LessonItems } from "./lessonitems";
import type { Lesson } from "./types";

export function lessonItemsBetween(user: { id: number; class_id: number }, from: string, to: string): LessonItems {
  const items: LessonItems = new Map();
  const push = (date: string, subject: string | null, kind: LessonItem["kind"], text: string) => {
    if (!subject) return;
    const k = `${date}|${subject}`;
    items.set(k, [...(items.get(k) ?? []), { kind, text }]);
  };
  for (const t of listTests(user.id, user.class_id, from, to, { raw: true })) {
    if (t.makeup && t.attend !== 1) continue;
    push(t.date, t.subject_name, t.oral ? "oral" : "test", t.topic);
  }
  for (const t of listTasks(user.id, user.class_id, false)) {
    if (t.due_date && t.due_date >= from && t.due_date <= to) push(t.due_date, t.subject_name, "task", t.title);
  }
  return items;
}

/** Položky patří jen k první (neodpadlé) hodině předmětu daného dne, ať se u dvouhodinovek neopakují. */
export function itemsForLesson(items: LessonItems, date: string, l: Lesson, dayLessons: Lesson[]): LessonItem[] | undefined {
  const first = [...dayLessons].sort((a, b) => a.hour - b.hour).find((x) => x.subject === l.subject && x.change?.kind !== "cancelled");
  if (first !== l) return undefined;
  return items.get(`${date}|${l.subject}`);
}
