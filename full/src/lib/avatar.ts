/** Profilovky: malý čtvercový obrázek (prohlížeč ho před nahráním ořízne a zmenší) uložený v databázi. Vidí ho třída, správce a on sám. */
import { get, run } from "./db";
import type { User } from "./session";

export const MAX_AVATAR = 300 * 1024;

export class AvatarError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Jen rastrové formáty poznané podle obsahu. SVG se nepřijímá (mohlo by obsahovat skripty). */
const KINDS: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", test: (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
];

export const avatarVersion = (userId: number) => get<{ t: number }>("SELECT updated_at t FROM avatars WHERE user_id = ?", userId)?.t ?? null;
export const avatarUrl = (userId: number, v: number) => `/avatar/${userId}?v=${v}`;

export function saveAvatar(userId: number, data: Buffer) {
  if (!data.length) throw new AvatarError("Chybí obrázek.");
  if (data.length > MAX_AVATAR) throw new AvatarError("Obrázek je moc velký.", 413);
  const kind = KINDS.find((k) => k.test(data));
  if (!kind) throw new AvatarError("Použij obrázek PNG, JPEG nebo WebP.", 415);
  run(
    "INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at",
    userId, kind.mime, data, Date.now(),
  );
}

export const removeAvatar = (userId: number) => run("DELETE FROM avatars WHERE user_id = ?", userId).changes > 0;

/** Profilovku vidí spolužáci ze stejné třídy, správce a on sám. */
export function readAvatar(viewer: Pick<User, "id" | "class_id" | "role">, userId: number) {
  const r = get<{ mime: string; data: Buffer; updated_at: number; class_id: number }>(
    "SELECT a.mime, a.data, a.updated_at, u.class_id FROM avatars a JOIN users u ON u.id = a.user_id WHERE a.user_id = ?",
    userId,
  );
  if (!r) return null;
  if (viewer.role !== "admin" && viewer.id !== userId && viewer.class_id !== r.class_id) return null;
  return r;
}
