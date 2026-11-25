/** Data widgetů (stejné v plné i odlehčené verzi). */
export type ELesson = { hour: number; subject: string; begin: string; end: string; room?: string; teacher?: string; cancelled?: boolean; change?: string | null; hue?: string };
export type EDay = { date: string; lessons: ELesson[]; note?: string };
export type EMark = { subject: string; value: string; caption?: string; weight?: number | null; date: string; isNew?: boolean; hue?: string };
export type EAverage = { subject: string; average: string; marks: number; hue?: string };
export type EAbsence = { total: number; excused: number; unsolved: number; missed: number; late: number; threshold: number; subjects: { name: string; lessons: number; missed: number }[] };
export type EKomens = { title: string; sender: string; date: string; read: boolean };
export type ELunch = { date: string; meals: { kind: string; name: string; ordered: boolean }[] };
export type ETask = { title: string; subject?: string; due?: string | null; hue?: string };
export type ETest = { subject: string; topic?: string; date: string; hue?: string };

export type RenderInput =
  | { id: "rozvrh"; days: EDay[]; today: string }
  | { id: "suplovani"; days: EDay[]; today: string }
  | { id: "znamky"; marks: EMark[] }
  | { id: "prumery"; averages: EAverage[] }
  | { id: "absence"; absence: EAbsence | null }
  | { id: "komens"; messages: EKomens[] }
  | { id: "obedy"; lunch: ELunch[] | null; today: string }
  | { id: "ukoly"; tasks: ETask[]; today: string }
  | { id: "testy"; tests: ETest[]; today: string };
