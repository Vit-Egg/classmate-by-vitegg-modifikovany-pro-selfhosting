/** Nahrávky z hodin u poznámek: soubory na disku v DATA_DIR/audio, údaje v tabulce note_audio. */
import { DISK_LOW_MESSAGE, diskLow } from "./disk";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { all, get, run } from "./db";
import { dataDir } from "./paths";
import { streamToFile } from "./upload";

export const MAX_FILE = 100 * 1024 * 1024; // pod limitem 100 MB u Cloudflare Tunnelu
export const QUOTA = Number(process.env.AUDIO_QUOTA_MB ?? 2048) * 1024 * 1024;
export const MAX_PER_NOTE = 20;

export type AudioRow = { id: number; note_id: number; user_id: number; name: string; mime: string; file: string; size: number; duration: number | null; created_at: number };
export type AudioView = Pick<AudioRow, "id" | "name" | "mime" | "size" | "duration" | "created_at">;

/** Povolené kontejnery podle obsahu souboru (ne podle toho, co tvrdí prohlížeč). */
const KINDS: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "audio/webm", ext: "webm", test: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  { mime: "audio/ogg", ext: "ogg", test: (b) => b.toString("latin1", 0, 4) === "OggS" },
  { mime: "audio/mp4", ext: "m4a", test: (b) => b.toString("latin1", 4, 8) === "ftyp" },
  { mime: "audio/mpeg", ext: "mp3", test: (b) => b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) },
  { mime: "audio/wav", ext: "wav", test: (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE" },
  { mime: "audio/flac", ext: "flac", test: (b) => b.toString("latin1", 0, 4) === "fLaC" },
];

export class AudioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const dir = (userId: number) => {
  const d = path.join(dataDir(), "audio", String(userId));
  fs.mkdirSync(d, { recursive: true });
  return d;
};
export const filePath = (row: Pick<AudioRow, "user_id" | "file">) => path.join(dataDir(), "audio", String(row.user_id), row.file);

export const usedBytes = (userId: number) => get<{ n: number | null }>("SELECT SUM(size) AS n FROM note_audio WHERE user_id = ?", userId)?.n ?? 0;
export const listAudio = (noteId: number) => all<AudioView>("SELECT id, name, mime, size, duration, created_at FROM note_audio WHERE note_id = ? ORDER BY created_at", noteId);
export const getAudio = (id: number) => get<AudioRow>("SELECT * FROM note_audio WHERE id = ?", id);

/** Uloží nahrávku ze streamu. Typ se pozná z prvních bajtů, velikost a kvóta se hlídají za běhu. */
export async function saveAudio(opts: { userId: number; noteId: number; body: ReadableStream<Uint8Array>; length: number | null; name: string; duration: number | null }) {
  if (opts.length != null && opts.length > MAX_FILE) throw new AudioError(`Soubor je moc velký (nejvýš ${MAX_FILE / 1024 / 1024} MB).`, 413);
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM note_audio WHERE note_id = ?", opts.noteId)?.n ?? 0) >= MAX_PER_NOTE) throw new AudioError(`K jedné poznámce jde přidat nejvýš ${MAX_PER_NOTE} nahrávek.`, 409);
  if (diskLow()) throw new AudioError(DISK_LOW_MESSAGE, 507);
  const free = QUOTA - usedBytes(opts.userId);
  if (free <= 0 || (opts.length != null && opts.length > free)) throw new AudioError("Došlo místo pro nahrávky. Smaž nějaké staré.", 507);

  const tmp = path.join(dir(opts.userId), `${crypto.randomBytes(12).toString("base64url")}.part`);
  let kind: (typeof KINDS)[number] | undefined;
  let head = Buffer.alloc(0);
  const bad = () => new AudioError("Tohle není zvukový soubor, který umím přehrát (WebM, OGG, MP3, M4A, WAV, FLAC).");
  let size = 0;
  try {
    size = await streamToFile(opts.body, tmp, (chunk, total) => {
      if (total > MAX_FILE) throw new AudioError(`Soubor je moc velký (nejvýš ${MAX_FILE / 1024 / 1024} MB).`, 413);
      if (total > free) throw new AudioError("Došlo místo pro nahrávky. Smaž nějaké staré.", 507);
      if (!kind) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= 16) {
          kind = KINDS.find((k) => k.test(head));
          if (!kind) throw bad();
        }
      }
    });
    if (!kind) kind = KINDS.find((k) => head.length >= 12 && k.test(head));
    if (!kind || size < 16) throw bad();
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (e instanceof AudioError) throw e;
    console.error("audio save failed", e);
    throw new AudioError("Nahrávání se přerušilo, zkus to znovu.", 499);
  }
  const file = `${crypto.randomBytes(12).toString("base64url")}.${kind.ext}`;
  fs.renameSync(tmp, path.join(dir(opts.userId), file));
  const name = opts.name.trim().slice(0, 120) || "Nahrávka";
  const id = Number(run("INSERT INTO note_audio (note_id, user_id, name, mime, file, size, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", opts.noteId, opts.userId, name, kind.mime, file, size, opts.duration, Date.now()).lastInsertRowid);
  return get<AudioView>("SELECT id, name, mime, size, duration, created_at FROM note_audio WHERE id = ?", id)!;
}

export function deleteAudio(row: AudioRow) {
  run("DELETE FROM note_audio WHERE id = ?", row.id);
  fs.rmSync(filePath(row), { force: true });
}

/** Smaže soubory (řádky v DB mizí kaskádou s poznámkou nebo účtem). */
export function purgeFiles(rows: Pick<AudioRow, "user_id" | "file">[]) {
  for (const r of rows) fs.rmSync(filePath(r), { force: true });
}
export const purgeNoteAudio = (noteId: number) => purgeFiles(all<AudioRow>("SELECT * FROM note_audio WHERE note_id = ?", noteId));
export const purgeUserAudio = (userId: number) => fs.rmSync(path.join(dataDir(), "audio", String(userId)), { recursive: true, force: true });

/**
 * WebM a OGG z MediaRecorderu mají v Chrome chybnou nebo žádnou délku a Safari (Mac, iPhone) je často vůbec nepřehraje.
 * Proto se při prvním přehrání převedou na M4A (AAC), které zvládne každý prohlížeč. Převod běží jednou na soubor, ostatní požadavky na něj počkají.
 * Kdyby ffmpeg chyběl nebo selhal, zůstane původní soubor.
 */
const converting = new Map<number, Promise<AudioRow>>();

/** Převody běží nejvýš dva naráz (FFMPEG_CONCURRENCY), ostatní čekají: při hromadném přehrávání by jinak ffmpeg zahltil procesor celého serveru. */
const maxConvert = Math.max(1, Number(process.env.FFMPEG_CONCURRENCY) || 2);
let busy = 0;
const waiting: (() => void)[] = [];
const slot = () => (busy < maxConvert ? (busy++, Promise.resolve()) : new Promise<void>((r) => waiting.push(r)));
const freeSlot = () => {
  const next = waiting.shift();
  if (next) next();
  else busy--;
};
export function ensurePlayable(row: AudioRow): Promise<AudioRow> {
  if (row.mime !== "audio/webm" && row.mime !== "audio/ogg") return Promise.resolve(row);
  const running = converting.get(row.id);
  if (running) return running;
  const job = (async () => {
    const src = filePath(row);
    const file = `${crypto.randomBytes(12).toString("base64url")}.m4a`;
    const out = path.join(dir(row.user_id), file);
    await slot();
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn("ffmpeg", ["-v", "error", "-y", "-threads", "1", "-i", src, "-vn", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-f", "mp4", out], { stdio: "ignore" });
      const kill = setTimeout(() => p.kill("SIGKILL"), 5 * 60_000); // zaseknutý převod nesmí držet místo věčně
      p.on("error", () => resolve(false));
      p.on("close", (code) => {
        clearTimeout(kill);
        resolve(code === 0);
      });
    }).finally(freeSlot);
    let size = 0;
    try { size = fs.statSync(out).size; } catch {}
    if (!ok || size < 16) {
      fs.rmSync(out, { force: true });
      return row;
    }
    run("UPDATE note_audio SET mime = 'audio/mp4', file = ?, size = ? WHERE id = ?", file, size, row.id);
    fs.rmSync(src, { force: true });
    return { ...row, mime: "audio/mp4", file, size };
  })()
    .catch(() => row)
    .finally(() => converting.delete(row.id));
  converting.set(row.id, job);
  return job;
}
