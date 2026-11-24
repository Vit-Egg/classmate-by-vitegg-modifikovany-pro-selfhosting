/** Veřejné hodnocení poznámky spolužáka: hvězdičky a komentář, které vidí všichni, kdo poznámku smějí číst. */
import { all, get, run } from "./db";

export type NoteVote = { user_id: number; name: string; stars: number; comment: string; updated_at: number };
export type NoteVotes = { avg: number; count: number; mine: { stars: number; comment: string } | null; others: NoteVote[] };

export function getNoteVotes(noteId: number, viewerId: number): NoteVotes {
  const rows = all<NoteVote>("SELECT v.user_id, u.name, v.stars, v.comment, v.updated_at FROM note_votes v JOIN users u ON u.id = v.user_id WHERE v.note_id = ? ORDER BY v.updated_at DESC", noteId);
  const mine = rows.find((r) => r.user_id === viewerId);
  return {
    avg: rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : 0,
    count: rows.length,
    mine: mine ? { stars: mine.stars, comment: mine.comment } : null,
    others: rows.filter((r) => r.user_id !== viewerId),
  };
}

/** Uloží (nebo smaže, když je stars null) hodnocení poznámky. */
export function saveNoteVote(userId: number, noteId: number, stars: number | null, comment: string) {
  const n = Number(stars);
  if (stars == null || !Number.isInteger(n) || n < 1 || n > 5) {
    run("DELETE FROM note_votes WHERE note_id = ? AND user_id = ?", noteId, userId);
    return;
  }
  run(
    `INSERT INTO note_votes (note_id, user_id, stars, comment, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (note_id, user_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, updated_at = excluded.updated_at`,
    noteId, userId, n, String(comment ?? "").trim().slice(0, 300), Date.now(),
  );
}

/** Průměr a počet hodnocení pro seznam poznámek (id poznámky -> údaje). */
export function voteSummary(noteIds: number[]): Map<number, { avg: number; count: number }> {
  const out = new Map<number, { avg: number; count: number }>();
  if (!noteIds.length) return out;
  const q = noteIds.map(() => "?").join(",");
  for (const r of all<{ note_id: number; avg: number; n: number }>(`SELECT note_id, AVG(stars) avg, COUNT(*) n FROM note_votes WHERE note_id IN (${q}) GROUP BY note_id`, ...noteIds)) out.set(r.note_id, { avg: r.avg, count: r.n });
  return out;
}
