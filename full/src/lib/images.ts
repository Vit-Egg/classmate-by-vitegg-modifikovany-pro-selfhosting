/** Obrázky v poznámkách: soubory v DATA_DIR/images, údaje v tabulce note_images. Vkládají se do textu poznámky jako uzel „image“. */
import { DISK_LOW_MESSAGE, diskLow } from "./disk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { all, get, run } from "./db";
import { dataDir } from "./paths";
import { streamToFile } from "./upload";

export const MAX_IMAGE = 12 * 1024 * 1024;
export const IMAGE_QUOTA = Number(process.env.IMAGE_QUOTA_MB || 500) * 1024 * 1024;
export const MAX_IMAGES_PER_NOTE = 100;

export type ImageRow = { id: number; note_id: number; user_id: number; file: string; mime: string; size: number; created_at: number };

/** Jen rastrové formáty poznáme podle obsahu. SVG se záměrně nepřijímá (mohlo by obsahovat skripty). */
const KINDS: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.readUInt32BE(0) === 0x89504e47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.toString("latin1", 0, 4) === "GIF8" },
  { mime: "image/webp", ext: "webp", test: (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
];

export class ImageError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const dir = (userId: number) => {
  const d = path.join(dataDir(), "images", String(userId));
  fs.mkdirSync(d, { recursive: true });
  return d;
};
export const imagePath = (r: Pick<ImageRow, "user_id" | "file">) => path.join(dataDir(), "images", String(r.user_id), r.file);
export const getImage = (id: number) => get<ImageRow>("SELECT * FROM note_images WHERE id = ?", id);
export const imageSrc = (noteId: number, id: number) => `/poznamky/${noteId}/obrazek/${id}`;
const usedBytes = (userId: number) => get<{ n: number | null }>("SELECT SUM(size) AS n FROM note_images WHERE user_id = ?", userId)?.n ?? 0;

export async function saveImage(o: { userId: number; noteId: number; body: ReadableStream<Uint8Array>; length: number | null }) {
  if (o.length != null && o.length > MAX_IMAGE) throw new ImageError("Obrázek je moc velký (nejvýš 12 MB).", 413);
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM note_images WHERE note_id = ?", o.noteId)?.n ?? 0) >= MAX_IMAGES_PER_NOTE) throw new ImageError(`K jedné poznámce jde přidat nejvýš ${MAX_IMAGES_PER_NOTE} obrázků.`, 409);
  if (diskLow()) throw new ImageError(DISK_LOW_MESSAGE, 507);
  const free = IMAGE_QUOTA - usedBytes(o.userId);
  if (free <= 0) throw new ImageError("Došlo místo pro obrázky. Smaž nějaké staré.", 507);

  const tmp = path.join(dir(o.userId), `${crypto.randomBytes(12).toString("base64url")}.part`);
  let kind: (typeof KINDS)[number] | undefined;
  let head = Buffer.alloc(0);
  const bad = () => new ImageError("Tohle není obrázek, který umím vložit (PNG, JPEG, GIF, WebP).");
  try {
    const size = await streamToFile(o.body, tmp, (chunk, total) => {
      if (total > MAX_IMAGE) throw new ImageError("Obrázek je moc velký (nejvýš 12 MB).", 413);
      if (total > free) throw new ImageError("Došlo místo pro obrázky. Smaž nějaké staré.", 507);
      if (!kind) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= 12) {
          kind = KINDS.find((k) => k.test(head));
          if (!kind) throw bad();
        }
      }
    });
    if (!kind) kind = head.length >= 12 ? KINDS.find((k) => k.test(head)) : undefined;
    if (!kind) throw bad();
    return finish(o, tmp, kind, size);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    if (e instanceof ImageError) throw e;
    console.error("image save failed", e);
    throw new ImageError("Nahrávání se přerušilo, zkus to znovu.", 499);
  }
}

function finish(o: { userId: number; noteId: number }, tmp: string, kind: (typeof KINDS)[number], size: number) {
  const file = `${crypto.randomBytes(12).toString("base64url")}.${kind.ext}`;
  fs.renameSync(tmp, path.join(dir(o.userId), file));
  const id = Number(run("INSERT INTO note_images (note_id, user_id, file, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)", o.noteId, o.userId, file, kind.mime, size, Date.now()).lastInsertRowid);
  return { id, src: imageSrc(o.noteId, id) };
}

/* ---------- dokument ---------- */

type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[] };
const SRC = /^\/poznamky\/\d+\/obrazek\/\d+$/;

/** Ponechá jen obrázky z naší aplikace (žádné cizí adresy ani data:) a jen povolené vlastnosti. */
export function cleanDoc(content: string): string {
  const doc = JSON.parse(content) as DocNode;
  const walk = (n: DocNode): DocNode | null => {
    if (n.type === "image") {
      const src = n.attrs?.src;
      if (typeof src !== "string" || !SRC.test(src)) return null;
      const w = Number(n.attrs?.width);
      return { type: "image", attrs: { src, alt: typeof n.attrs?.alt === "string" ? n.attrs.alt.slice(0, 200) : null, title: null, width: Number.isInteger(w) && w >= 8 && w < 100 ? w : null } };
    }
    let out: DocNode = n;
    // odkazy: jen http(s), mailto a tel (javascript: a podobné by se po kliknutí spustily), žádné další vlastnosti
    if (Array.isArray((n as { marks?: unknown }).marks)) {
      const marks = ((n as unknown as { marks: { type?: string; attrs?: { href?: unknown } }[] }).marks)
        .filter((m) => m && typeof m.type === "string")
        .map((m) => (m.type === "link" ? (typeof m.attrs?.href === "string" && /^(https?:\/\/|mailto:|tel:)/i.test(m.attrs.href.trim()) ? { type: "link", attrs: { href: m.attrs.href.trim().slice(0, 2000) } } : null) : m))
        .filter(Boolean);
      out = { ...n, marks } as unknown as DocNode;
    }
    return out.content ? { ...out, content: out.content.map(walk).filter((x): x is DocNode => !!x) } : out;
  };
  return JSON.stringify(walk(doc));
}

/** Smaže obrázky poznámky, které už v textu nejsou (starší než hodina, ať nejde o čerstvě vložený obrázek před uložením). */
export function pruneImages(noteId: number, content: string, graceMs = 3600_000) {
  const used = new Set([...content.matchAll(/\/poznamky\/(\d+)\/obrazek\/(\d+)/g)].filter((m) => Number(m[1]) === noteId).map((m) => Number(m[2])));
  for (const r of all<ImageRow>("SELECT * FROM note_images WHERE note_id = ? AND created_at < ?", noteId, Date.now() - graceMs)) {
    if (used.has(r.id)) continue;
    run("DELETE FROM note_images WHERE id = ?", r.id);
    fs.rmSync(imagePath(r), { force: true });
  }
}

/** Při duplikaci poznámky se obrázky zkopírují a odkazy v textu přepíšou, ať kopie nezávisí na originálu. */
export function cloneImages(srcNoteId: number, dstNoteId: number, content: string): string {
  let out = content;
  for (const r of all<ImageRow>("SELECT * FROM note_images WHERE note_id = ?", srcNoteId)) {
    const from = imageSrc(srcNoteId, r.id);
    if (!out.includes(from)) continue;
    const file = `${crypto.randomBytes(12).toString("base64url")}${path.extname(r.file)}`;
    try {
      fs.copyFileSync(imagePath(r), path.join(dir(r.user_id), file));
    } catch {
      continue;
    }
    const id = Number(run("INSERT INTO note_images (note_id, user_id, file, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)", dstNoteId, r.user_id, file, r.mime, r.size, Date.now()).lastInsertRowid);
    out = out.split(from).join(imageSrc(dstNoteId, id));
  }
  return out;
}

export const purgeNoteImages = (noteId: number) => {
  for (const r of all<ImageRow>("SELECT * FROM note_images WHERE note_id = ?", noteId)) fs.rmSync(imagePath(r), { force: true });
};
export const purgeUserImages = (userId: number) => fs.rmSync(path.join(dataDir(), "images", String(userId)), { recursive: true, force: true });
