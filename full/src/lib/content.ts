import { all, get, run } from "./db";
import type { Hue } from "./types";
import { lessonsOver } from "./starttime";
import { pragueNow } from "./dates";

export type TaskRow = {
  id: number;
  title: string;
  note: string;
  due_date: string | null;
  subject_name: string | null;
  hue: Hue | null;
  group_label: string | null;
  done: number;
  created_by: number | null;
  /** jméno toho, kdo položku zadal (prázdné, když účet zanikl) */
  author: string | null;
  updated_by: number | null;
  editor: string | null;
  updated_at: number | null;
  /** 1 = jen pro autora */
  private: number;
};

/** Obsah vidí celá třída (group_id NULL), nebo jen členové dané skupiny. */
const VISIBLE = `t.class_id = :class AND (t.private = 0 OR t.created_by = :user) AND (t.group_id IS NULL OR t.group_id IN (SELECT group_id FROM user_subjects WHERE user_id = :user))`;

/** Úkoly s termínem v rozmezí (otevřené i hotové) – pro kalendář. */
export function tasksDue(userId: number, classId: number, from: string, to: string) {
  return all<TaskRow>(
    `SELECT * FROM (
       SELECT t.id, t.title, t.note, t.due_date, s.name AS subject_name, s.hue, g.label AS group_label, t.created_by, cu.name AS author, t.private, t.updated_by, uu.name AS editor, t.updated_at,
              EXISTS (SELECT 1 FROM task_done d WHERE d.task_id = t.id AND d.user_id = :user) AS done
       FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users uu ON uu.id = t.updated_by
       WHERE ${VISIBLE} AND t.due_date >= :from AND t.due_date <= :to
     ) ORDER BY due_date, id`,
    { user: userId, class: classId, from, to },
  );
}

/**
 * Úkoly pro seznam. Výchozí pohled ukazuje otevřené nebo hotové úkoly bez termínu nebo s termínem od dneška.
 * past = true vrátí historii: všechny úkoly s termínem před dneškem (hotové i nehotové), nejnovější nahoře. Nic se nemaže.
 */
export function listTasks(userId: number, classId: number, done: boolean, past = false) {
  const today = pragueNow().date;
  return all<TaskRow>(
    `SELECT * FROM (
       SELECT t.id, t.title, t.note, t.due_date, s.name AS subject_name, s.hue, g.label AS group_label, t.created_by, cu.name AS author, t.private, t.updated_by, uu.name AS editor, t.updated_at,
              EXISTS (SELECT 1 FROM task_done d WHERE d.task_id = t.id AND d.user_id = :user) AS done
       FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users uu ON uu.id = t.updated_by
       WHERE ${VISIBLE} AND ${past ? "t.due_date < :today" : "(t.due_date IS NULL OR t.due_date >= :today)"}
     ) ${past ? "ORDER BY due_date DESC, id DESC" : "WHERE done = :done ORDER BY (due_date IS NULL), due_date, id"}`,
    past ? { user: userId, class: classId, today } : { user: userId, class: classId, today, done: done ? 1 : 0 },
  );
}

export type TestRow = {
  id: number;
  date: string;
  topic: string;
  subject_name: string;
  hue: Hue;
  group_label: string | null;
  created_by: number | null;
  /** jméno toho, kdo položku zadal (prázdné, když účet zanikl) */
  author: string | null;
  updated_by: number | null;
  editor: string | null;
  updated_at: number | null;
  /** 1 = jen pro autora */
  private: number;
  /** 1 = náhradní termín */
  makeup: number;
  /** 1 = zkoušení (0 = test) */
  oral: number;
  /** volba u náhradního termínu: 1 = píšu, 0 = nepíšu, null = nerozhodnuto */
  attend: number | null;
};

export function listTests(userId: number, classId: number, fromDate: string, toDate = "9999-12-31", opts: { raw?: boolean; hidden?: boolean; all?: boolean } = {}) {
  const rows = all<TestRow>(
    `SELECT t.id, t.date, t.topic, s.name AS subject_name, s.hue, g.label AS group_label, t.created_by, cu.name AS author, t.private, t.makeup, t.oral, t.updated_by, uu.name AS editor, t.updated_at, ta.writes AS attend
     FROM tests t JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users uu ON uu.id = t.updated_by
     LEFT JOIN test_attend ta ON ta.test_id = t.id AND ta.user_id = :user
     WHERE ${VISIBLE} AND t.date >= :from AND t.date <= :to AND ${opts.all ? "1" : opts.hidden ? "ta.writes = 0" : "(ta.writes IS NULL OR ta.writes = 1)"}
     ORDER BY t.date ${opts.all ? "DESC" : ""}, t.id ${opts.all ? "DESC" : ""}`,
    { user: userId, class: classId, from: fromDate, to: toDate },
  );
  // dnešní test zmizí, jakmile skončí poslední hodina jeho předmětu (do té doby se ukazuje)
  if (opts.raw || opts.hidden || opts.all) return rows;
  const over = lessonsOver(userId);
  return rows.filter((t) => !over(t.date, t.subject_name));
}

/** Test, který uživatel smí vidět (a jehož termín ještě nepřekročil dnešek). */
export function visibleTest(userId: number, classId: number, id: number, today: string) {
  return get<{ id: number; date: string; topic: string; makeup: number; oral: number; subject_id: number; class_id: number; subject_name: string; hue: Hue; group_label: string | null }>(
    `SELECT t.id, t.date, t.topic, t.makeup, t.oral, t.subject_id, t.class_id, s.name AS subject_name, s.hue, g.label AS group_label
     FROM tests t JOIN subjects s ON s.id = t.subject_id LEFT JOIN groups g ON g.id = t.group_id
     WHERE ${VISIBLE} AND t.id = :id AND t.date >= :today`,
    { user: userId, class: classId, id, today },
  );
}

export const taskOwner = (id: number) => get<{ created_by: number | null; class_id: number; private: number }>("SELECT created_by, class_id, private FROM tasks WHERE id = ?", id);
export const testOwner = (id: number) => get<{ created_by: number | null; class_id: number; private: number }>("SELECT created_by, class_id, private FROM tests WHERE id = ?", id);

/** bk_id předmětu → barva, pro vykreslení rozvrhu. */
export const subjectHues = (classId: number) =>
  new Map(all<{ bk_id: string; hue: string }>("SELECT bk_id, hue FROM subjects WHERE class_id = ?", classId).map((s) => [s.bk_id, s.hue]));

/** Zapamatuje, jestli uživatel píše náhradní termín (true/false), nebo volbu zruší (null). */
export function setAttend(userId: number, classId: number, testId: number, writes: boolean | null) {
  if (!get("SELECT 1 FROM tests t WHERE t.id = :id AND " + VISIBLE, { id: testId, user: userId, class: classId })) return false;
  if (writes === null) run("DELETE FROM test_attend WHERE user_id = ? AND test_id = ?", userId, testId);
  else run("INSERT INTO test_attend (user_id, test_id, writes) VALUES (?, ?, ?) ON CONFLICT (user_id, test_id) DO UPDATE SET writes = excluded.writes", userId, testId, writes ? 1 : 0);
  return true;
}

/** Historie testů a zkoušení: všechno, co už proběhlo (dřívější dny i dnešek po poslední hodině předmětu), nejnovější nahoře. */
export function listPastTests(userId: number, classId: number) {
  const today = pragueNow().date;
  const over = lessonsOver(userId);
  return listTests(userId, classId, "0000-01-01", today, { all: true }).filter((t) => t.date < today || over(t.date, t.subject_name));
}
