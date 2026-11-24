import { get, run } from "./db";

export type Reflection = { understanding: number | null; understanding_note: string; focus: number | null; focus_note: string };
export const EMPTY_REFLECTION: Reflection = { understanding: null, understanding_note: "", focus: null, focus_note: "" };

export const getReflection = (userId: number, noteId: number): Reflection =>
  get<Reflection>("SELECT understanding, understanding_note, focus, focus_note FROM note_reflections WHERE user_id = ? AND note_id = ?", userId, noteId) ?? EMPTY_REFLECTION;

const level = (v: unknown) => {
  const n = Number(v);
  return v != null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/** Uloží moje hodnocení poznámky; když je celé prázdné, záznam se smaže. */
export function saveReflection(userId: number, noteId: number, r: Partial<Reflection>) {
  const v = {
    understanding: level(r.understanding),
    understanding_note: String(r.understanding_note ?? "").slice(0, 500),
    focus: level(r.focus),
    focus_note: String(r.focus_note ?? "").slice(0, 500),
  };
  if (v.understanding == null && v.focus == null && !v.understanding_note.trim() && !v.focus_note.trim()) {
    run("DELETE FROM note_reflections WHERE user_id = ? AND note_id = ?", userId, noteId);
    return;
  }
  run(
    `INSERT INTO note_reflections (user_id, note_id, understanding, understanding_note, focus, focus_note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, note_id) DO UPDATE SET understanding = excluded.understanding, understanding_note = excluded.understanding_note, focus = excluded.focus, focus_note = excluded.focus_note, updated_at = excluded.updated_at`,
    userId, noteId, v.understanding, v.understanding_note, v.focus, v.focus_note, Date.now(),
  );
}
