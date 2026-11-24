/** Přílohy k poznámkám (pracovní listy v PDF, dokumenty, obrázky): soubory na disku v DATA_DIR/files, údaje v tabulce note_files. */
import { DISK_LOW_MESSAGE, diskLow } from "./disk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { all, get, run } from "./db";
import { dataDir } from "./paths";
import { streamToFile } from "./upload";

export const MAX_FILE = 25 * 1024 * 1024;
export const QUOTA = Number(process.env.FILE_QUOTA_MB ?? 1024) * 1024 * 1024;
export const MAX_PER_NOTE = 30;

export type FileRow = { id: number; note_id: number; user_id: number; name: string; mime: string; file: string; size: number; created_at: number };
export type FileView = Pick<FileRow, "id" | "name" | "mime" | "size" | "created_at"> & { user_id: number };

type Kind = { exts: string[]; mime: Record<string, string>; test: (b: Buffer) => boolean; inline?: boolean };

/** Povolené typy; obsah se kontroluje podle prvních bajtů a musí sedět s příponou. Nic spustitelného ani HTML/SVG se nepřijímá. */
const ZIP = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05);
const OLE = (b: Buffer) => b.readUInt32BE(0) === 0xd0cf11e0;
const KINDS: Kind[] = [
  { exts: ["pdf"], mime: { pdf: "application/pdf" }, test: (b) => b.toString("latin1", 0, 5) === "%PDF-", inline: true },
  { exts: ["png"], mime: { png: "image/png" }, test: (b) => b.readUInt32BE(0) === 0x89504e47, inline: true },
  { exts: ["jpg", "jpeg"], mime: { jpg: "image/jpeg", jpeg: "image/jpeg" }, test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, inline: true },
  { exts: ["gif"], mime: { gif: "image/gif" }, test: (b) => b.toString("latin1", 0, 4) === "GIF8", inline: true },
  { exts: ["webp"], mime: { webp: "image/webp" }, test: (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP", inline: true },
  {
    exts: ["docx", "xlsx", "pptx", "odt", "ods", "odp", "zip"],
    mime: {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation", zip: "application/zip",
    },
    test: ZIP,
  },
  { exts: ["doc", "xls", "ppt"], mime: { doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint" }, test: OLE },
  { exts: ["txt", "csv", "md"], mime: { txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", md: "text/plain; charset=utf-8" }, test: (b) => !b.includes(0) },
];
export const ACCEPT = KINDS.flatMap((k) => k.exts.map((e) => `.${e}`)).join(",");

export class FileError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const dir = (userId: number) => {
  const d = path.join(dataDir(), "files", String(userId));
  fs.mkdirSync(d, { recursive: true });
  return d;
};
export const filePath = (row: Pick<FileRow, "user_id" | "file">) => path.join(dataDir(), "files", String(row.user_id), row.file);
export const usedBytes = (userId: number) => get<{ n: number | null }>("SELECT SUM(size) AS n FROM note_files WHERE user_id = ?", userId)?.n ?? 0;
export const listFiles = (noteId: number) => all<FileView>("SELECT id, user_id, name, mime, size, created_at FROM note_files WHERE note_id = ? ORDER BY created_at", noteId);
export const getFile = (id: number) => get<FileRow>("SELECT * FROM note_files WHERE id = ?", id);
export const isInline = (row: Pick<FileRow, "mime">) => row.mime === "application/pdf" || row.mime.startsWith("image/");

/** Název souboru bez cesty a řídicích znaků. */
const cleanName = (raw: string) => raw.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(-150);

export async function saveFile(o: { userId: number; noteId: number; body: ReadableStream<Uint8Array>; length: number | null; name: string }) {
  const name = cleanName(o.name);
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1].toLowerCase() ?? "";
  const kind = KINDS.find((k) => k.exts.includes(ext));
  if (!kind) throw new FileError("Tenhle typ souboru nejde přidat. Povolené jsou PDF, obrázky, dokumenty Office a LibreOffice, ZIP a textové soubory.", 415);
  if (o.length != null && o.length > MAX_FILE) throw new FileError(`Soubor je moc velký (nejvýš ${MAX_FILE / 1024 / 1024} MB).`, 413);
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM note_files WHERE note_id = ?", o.noteId)?.n ?? 0) >= MAX_PER_NOTE) throw new FileError(`K jedné poznámce jde přidat nejvýš ${MAX_PER_NOTE} příloh.`, 409);
  if (diskLow()) throw new FileError(DISK_LOW_MESSAGE, 507);
  const free = QUOTA - usedBytes(o.userId);
  if (free <= 0 || (o.length != null && o.length > free)) throw new FileError("Došlo místo pro přílohy. Smaž nějaké staré.", 507);

  const tmp = path.join(dir(o.userId), `${crypto.randomBytes(12).toString("base64url")}.part`);
  let head = Buffer.alloc(0);
  const bad = () => new FileError("Obsah souboru neodpovídá jeho příponě.");
  let size = 0;
  try {
    size = await streamToFile(o.body, tmp, (chunk, total) => {
      if (total > MAX_FILE) throw new FileError(`Soubor je moc velký (nejvýš ${MAX_FILE / 1024 / 1024} MB).`, 413);
      if (total > free) throw new FileError("Došlo místo pro přílohy. Smaž nějaké staré.", 507);
      if (head.length < 4096) head = Buffer.concat([head, chunk]).subarray(0, 4096);
    });
    if (size < 4 || !kind.test(head)) throw bad();
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (e instanceof FileError) throw e;
    console.error("note file save failed", e);
    throw new FileError("Nahrávání se přerušilo, zkus to znovu.", 499);
  }
  const file = `${crypto.randomBytes(12).toString("base64url")}.${ext}`;
  fs.renameSync(tmp, path.join(dir(o.userId), file));
  const id = Number(run("INSERT INTO note_files (note_id, user_id, name, mime, file, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", o.noteId, o.userId, name, kind.mime[ext], file, size, Date.now()).lastInsertRowid);
  return get<FileView>("SELECT id, user_id, name, mime, size, created_at FROM note_files WHERE id = ?", id)!;
}

export function deleteFile(row: FileRow) {
  run("DELETE FROM note_files WHERE id = ?", row.id);
  fs.rmSync(filePath(row), { force: true });
}

/** Smaže soubory (řádky v DB mizí kaskádou s poznámkou nebo účtem). */
export const purgeNoteFiles = (noteId: number) => {
  for (const r of all<FileRow>("SELECT * FROM note_files WHERE note_id = ?", noteId)) fs.rmSync(filePath(r), { force: true });
};
export const purgeUserFiles = (userId: number) => fs.rmSync(path.join(dataDir(), "files", String(userId)), { recursive: true, force: true });
