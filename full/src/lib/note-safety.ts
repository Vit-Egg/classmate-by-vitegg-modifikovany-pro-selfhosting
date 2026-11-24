/**
 * Ochrana poznámek před ztrátou: historie verzí (snímek stavu před přepsáním), obnovení a koš.
 * Pravidlo snímků: nejvýš jeden za 10 minut, a hned navíc, když se poznámka podstatně zmenšuje (např. omylem smazaný text).
 */
import { all, get, run, tx } from "./db";
import { purgeNoteAudio } from "./audio";
import { purgeNoteImages } from "./images";
import { purgeNoteFiles } from "./note-files";

export const KEEP_VERSIONS = 40;
const EVERY_MS = 10 * 60_000;
export const TRASH_DAYS = 30;

type Cur = { title: string; content: string; text: string; board: string };

/** Uloží snímek aktuálního stavu poznámky (kdyby se text právě přepisoval). `newSize` = velikost nového obsahu pro detekci velkého zmenšení. */
export function snapshot(noteId: number, reason: "auto" | "restore" | "conflict" | "delete", opts: { force?: boolean; newSize?: number } = {}) {
  const cur = get<Cur>("SELECT title, content, text, board FROM notes WHERE id = ?", noteId);
  if (!cur || (cur.content === "" && cur.board === "")) return; // není co zachraňovat
  const size = cur.content.length + cur.board.length;
  const last = get<{ created_at: number }>("SELECT created_at FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1", noteId);
  const shrinking = opts.newSize !== undefined && size > 300 && opts.newSize < size * 0.5;
  if (!opts.force && !shrinking && last && Date.now() - last.created_at < EVERY_MS) return;
  run("INSERT INTO note_versions (note_id, title, content, text, board, created_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)", noteId, cur.title, cur.content, cur.text, cur.board, Date.now(), reason);
  run("DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)", noteId, noteId, KEEP_VERSIONS);
}

export type VersionRow = { id: number; created_at: number; reason: string; title: string; size: number; preview: string; hasBoard: boolean };

export const listVersions = (noteId: number): VersionRow[] =>
  all<{ id: number; created_at: number; reason: string; title: string; size: number; preview: string; board: number }>(
    "SELECT id, created_at, reason, title, length(content) + length(board) AS size, substr(text, 1, 160) AS preview, length(board) > 0 AS board FROM note_versions WHERE note_id = ? ORDER BY created_at DESC, id DESC",
    noteId,
  ).map((v) => ({ id: v.id, created_at: v.created_at, reason: v.reason, title: v.title, size: v.size, preview: v.preview, hasBoard: !!v.board }));

/** Vrátí poznámku do zvolené verze; předtím uloží snímek současného stavu, takže se dá vrátit i zpět. */
export function restoreVersion(noteId: number, versionId: number): number {
  return tx(() => {
    const v = get<Cur>("SELECT title, content, text, board FROM note_versions WHERE id = ? AND note_id = ?", versionId, noteId);
    if (!v) throw new Error("Verze neexistuje.");
    snapshot(noteId, "restore", { force: true });
    const now = Date.now();
    run("UPDATE notes SET title = ?, content = ?, text = ?, board = ?, rev = rev + 1, board_rev = board_rev + 1, updated_at = ? WHERE id = ?", v.title, v.content, v.text, v.board, now, noteId);
    return now;
  });
}

/** Trvalé smazání poznámky včetně souborů (nahrávky, obrázky). */
export function purgeNoteNow(noteId: number) {
  purgeNoteAudio(noteId);
  purgeNoteImages(noteId);
  purgeNoteFiles(noteId);
  run("DELETE FROM notes WHERE id = ?", noteId);
}

/** Koš se po 30 dnech vyprázdní (volá se z pravidelné úlohy na pozadí). Vrací počet trvale smazaných poznámek. */
export function purgeExpiredTrash(): number {
  const old = all<{ id: number }>("SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?", Date.now() - TRASH_DAYS * 86_400_000);
  for (const n of old) purgeNoteNow(n.id);
  return old.length;
}
