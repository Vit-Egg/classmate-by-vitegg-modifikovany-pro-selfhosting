export type Hue = "gray" | "purple" | "green" | "amber" | "blue";

export type ChangeKind = "cancelled" | "substitution" | "room" | "other";

export type Lesson = {
  day: number; // 1–5
  hour: number;
  subject: string;
  subjectId: string; // bk_id, prázdné u zrušené hodiny
  room: string;
  teacher: string;
  groups: string[]; // bk_id skupin
  cycles: string[]; // názvy cyklů (sudý/lichý týden)
  change?: { kind: ChangeKind; label: string; text?: string };
  theme?: string; // téma hodiny z Bakalářů
  teacherName?: string;
  roomName?: string;
  groupLabels?: string[];
};

export type Timetable = {
  hours: { hour: number; begin: string; end: string }[];
  days: { day: number; date?: string; description?: string }[];
  lessons: Lesson[];
  subjects: { id: string; name: string; abbrev: string }[];
  groups: { id: string; abbrev: string; name: string }[];
};

export type Mark = {
  id: string;
  subjectId: string;
  subject: string;
  caption: string;
  theme: string;
  text: string;
  value: number | null;
  /** Procentuální nebo bodový výsledek (0 až 100), pokud ho známka má; takový výsledek není N, i když nemá číselnou známku. */
  percent?: number | null;
  weight: number;
  date: string; // YYYY-MM-DD
  isNew: boolean;
};

export type MarksData = {
  /** `temporary`: předběžná (čtvrtletní, průběžná) známka, kterou učitel zapsal v Bakalářích (TemporaryMark), s poznámkou (TemporaryMarkNote). */
  subjects: { id: string; name: string; averageText: string; temporary?: string; temporaryNote?: string; marks: Mark[] }[];
};

/** Vysvědčení z Bakalářů (GET /api/3/marks/final): jedno pololetí s konečnými známkami. */
export type FinalTerm = { year: string; semester: string; semesterName: string; closed: boolean; average: number | null; achievement: string; absent: number; notExcused: number; date: string; marks: { subject: string; text: string; date: string }[] };
export type FinalData = { terms: FinalTerm[] };

/** Zameškané hodiny jednoho dne: Bakaláři je dělí na omluvené (Ok), nevyřízené (Unsolved) a neomluvené (Missed), celkem je jejich součet. */
export const absenceHours = (d: { missed: number; excused: number; unsolved: number }) => d.missed + d.excused + d.unsolved;

export type AbsenceData = {
  threshold: number; // podíl zameškaných hodin, od kterého hrozí klasifikace (0.25 = 25 %)
  days: { date: string; missed: number; excused: number; unsolved: number; late: number; soon: number; school: number }[];
  subjects: { name: string; lessons: number; missed: number; late: number; soon: number; school: number }[];
};

export type CacheResult<T> = { data: T | null; stale: boolean; error?: "auth" | "network" | "disconnected"; fetchedAt?: number };

/** Domácí úkoly z Bakalářů (jen ke čtení). */
export type HomeworkItem = { id: string; subjectId: string; subject: string; teacher: string; content: string; notice: string; start: string; end: string; hour: number; done: boolean; closed: boolean; attachments: { id: string; name: string; size: number }[] };
export type HomeworkData = { items: HomeworkItem[] };
