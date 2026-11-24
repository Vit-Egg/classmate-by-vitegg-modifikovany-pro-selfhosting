/** Předměty: přehled všeho k jednomu předmětu (rozvrh, učitelé, testy, úkoly, známky, absence, poznámky, témata hodin). */
import { all } from "./db";
import { listTasks, listTests } from "./content";
import { addDays, mondayOf, pragueNow } from "./dates";
import { weightedAverage } from "./normalize";
import { sharedNotes } from "./services";
import { isSelfStudy } from "./selfstudy";
import { fold } from "./text";
import { getAbsence, getMarks, getTimetable, getTimetableWeek, userSubjects, type SubjectRowFull } from "./sync";
import type { User } from "./session";
import type { Mark, Timetable } from "./types";

export type SubjectSummary = {
  subject: SubjectRowFull;
  teachers: string[];
  hoursPerWeek: number;
  average: number | null;
  nextTest?: { date: string; topic: string; oral: boolean };
  openTasks: number;
  notes: number;
};

const teacherOf = (l: { teacherName?: string; teacher: string }) => l.teacherName || l.teacher;

/** Hodiny předmětu ve stálém rozvrhu (sudý a lichý týden se neřeší zvlášť, jedna hodina se počítá jednou). */
function permanentSlots(perm: Timetable | null, bkId: string) {
  const seen = new Map<string, { day: number; hour: number; room: string; teacher: string }>();
  for (const l of perm?.lessons ?? []) {
    if (l.subjectId !== bkId) continue;
    const k = `${l.day}-${l.hour}`;
    if (!seen.has(k)) seen.set(k, { day: l.day, hour: l.hour, room: l.room, teacher: teacherOf(l) });
  }
  return [...seen.values()].sort((a, b) => a.day - b.day || a.hour - b.hour);
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export async function subjectsOverview(user: User): Promise<{ items: SubjectSummary[]; stale: boolean }> {
  const today = pragueNow().date;
  const [perm, marks] = await Promise.all([getTimetable(user, "permanent"), getMarks(user)]);
  const tests = listTests(user.id, user.class_id, today);
  const tasks = listTasks(user.id, user.class_id, false);
  const noteCounts = new Map(all<{ subject_id: number; n: number }>("SELECT subject_id, COUNT(*) n FROM notes WHERE deleted_at IS NULL AND user_id = ? AND subject_id IS NOT NULL GROUP BY subject_id", user.id).map((r) => [r.subject_id, r.n]));
  const items = userSubjects(user.id).map((subject) => {
    const slots = permanentSlots(perm.data, subject.bk_id);
    const m = marks.data?.subjects.find((s) => s.id === subject.bk_id);
    const t = tests.find((x) => x.subject_name === subject.name);
    return {
      subject,
      teachers: uniq(slots.map((s) => s.teacher)),
      hoursPerWeek: slots.length,
      average: m ? weightedAverage(m.marks) : null,
      nextTest: t ? { date: t.date, topic: t.topic, oral: !!t.oral } : undefined,
      openTasks: tasks.filter((x) => x.subject_name === subject.name).length,
      notes: noteCounts.get(subject.id) ?? 0,
    };
  });
  return { items, stale: !perm.data };
}

export type SubjectDetail = Awaited<ReturnType<typeof subjectDetail>>;

export async function subjectDetail(user: User, id: number) {
  const subject = userSubjects(user.id).find((s) => s.id === id);
  if (!subject) return null;
  const today = pragueNow().date;
  const thisMonday = mondayOf(today);
  const weeks = [-3, -2, -1, 0, 1].map((n) => addDays(thisMonday, n * 7));
  const [perm, marks, absence, ...weekResults] = await Promise.all([getTimetable(user, "permanent"), getMarks(user), getAbsence(user), ...weeks.map((m) => getTimetableWeek(user, m))]);

  const slots = permanentSlots(perm.data, subject.bk_id);
  const hours = new Map((perm.data?.hours ?? []).map((h) => [h.hour, h]));

  // témata hodin z posledních týdnů a nejbližší hodina z aktuálního a příštího týdne
  const themes: { date: string; hour: number; theme: string }[] = [];
  const upcoming: { date: string; hour: number; room: string; change?: string }[] = [];
  weekResults.forEach((r, i) => {
    for (const l of r.data?.lessons ?? []) {
      if (l.subjectId !== subject.bk_id) continue;
      const date = addDays(weeks[i], l.day - 1);
      if (l.theme && date <= today) themes.push({ date, hour: l.hour, theme: l.theme });
      if (date >= today && l.change?.kind !== "cancelled") upcoming.push({ date, hour: l.hour, room: l.room, change: l.change?.label });
    }
  });
  themes.sort((a, b) => b.date.localeCompare(a.date) || b.hour - a.hour);
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

  const m = marks.data?.subjects.find((s) => s.id === subject.bk_id);
  const markList: Mark[] = m ? [...m.marks].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const abs = absence.data?.subjects.find((s) => fold(s.name) === fold(subject.name));

  return {
    subject,
    teachers: uniq(slots.map((s) => s.teacher)),
    rooms: uniq(slots.filter((s) => !isSelfStudy(s.room)).map((s) => s.room)),
    selfStudyHours: slots.filter((s) => isSelfStudy(s.room)).length,
    slots: slots.map((s) => ({ ...s, begin: hours.get(s.hour)?.begin, end: hours.get(s.hour)?.end })),
    nextLessons: upcoming.slice(0, 3),
    themes: themes.slice(0, 8),
    themesAll: themes.slice(0, 30),
    tests: listTests(user.id, user.class_id, today).filter((t) => t.subject_name === subject.name),
    tasks: listTasks(user.id, user.class_id, false).filter((t) => t.subject_name === subject.name),
    marks: markList,
    average: m ? weightedAverage(m.marks) : null,
    averageText: m?.averageText,
    absence: abs,
    ownNotes: all<{ id: number; title: string; updated_at: number }>("SELECT id, title, updated_at FROM notes WHERE user_id = ? AND subject_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC LIMIT 20", user.id, subject.id),
    sharedNotes: sharedNotes(user).filter((n) => n.subject_id === subject.id).map((n) => ({ id: n.id, title: n.title, author: n.author })),
    stale: !perm.data || !marks.data,
  };
}
