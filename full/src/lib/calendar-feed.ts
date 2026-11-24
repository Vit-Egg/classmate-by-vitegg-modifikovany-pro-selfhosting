/** Odebíratelný kalendář: každý uživatel má jeden tajný odkaz, který jde kdykoli zrušit nebo obnovit. */
import { get, run } from "./db";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import type { CalKind } from "./calendar";
import { USER_SELECT, type User } from "./session";

export function feedToken(userId: number) {
  const row = get<{ token_enc: string }>("SELECT token_enc FROM calendar_feeds WHERE user_id = ?", userId);
  if (!row) return null;
  try {
    return decrypt(row.token_enc);
  } catch {
    return null;
  }
}

export const FEED_KINDS: { id: CalKind; label: string; hint: string }[] = [
  { id: "test", label: "Testy a zkoušení", hint: "Zadané testy a zkoušení tvé třídy a skupiny" },
  { id: "task", label: "Úkoly", hint: "Úkoly s termínem" },
  { id: "change", label: "Změny v rozvrhu", hint: "Suplování, zrušené hodiny, jiná učebna" },
  { id: "event", label: "Události a svátky", hint: "Prázdniny, volna a školní akce" },
  { id: "other", label: "Ostatní události", hint: "Školní akce a další události třídy" },
];
const DEFAULT_KINDS: CalKind[] = FEED_KINDS.map((k) => k.id);

export function feedKinds(userId: number): CalKind[] {
  const raw = get<{ kinds: string }>("SELECT kinds FROM calendar_feeds WHERE user_id = ?", userId)?.kinds;
  if (raw === undefined) return DEFAULT_KINDS;
  return DEFAULT_KINDS.filter((k) => raw.split(",").includes(k));
}

export function setFeedKinds(userId: number, kinds: string[]) {
  const ok = DEFAULT_KINDS.filter((k) => kinds.includes(k));
  run("UPDATE calendar_feeds SET kinds = ? WHERE user_id = ?", ok.join(","), userId);
}

/** Vytvoří nový odkaz (starý přestane platit). */
export function createFeed(userId: number) {
  const token = randomToken(24);
  run(
    `INSERT INTO calendar_feeds (user_id, token_hash, token_enc, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, token_enc = excluded.token_enc, created_at = excluded.created_at, last_used_at = NULL`,
    userId,
    sha256(token),
    encrypt(token),
    Date.now(),
  );
  return token;
}

export const deleteFeed = (userId: number) => void run("DELETE FROM calendar_feeds WHERE user_id = ?", userId);

export function feedUser(token: string): { user: User; kinds: CalKind[] } | null {
  const row = get<{ user_id: number }>("SELECT user_id FROM calendar_feeds WHERE token_hash = ?", sha256(token));
  if (!row) return null;
  run("UPDATE calendar_feeds SET last_used_at = ? WHERE user_id = ?", Date.now(), row.user_id);
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, row.user_id);
  return user ? { user, kinds: feedKinds(row.user_id) } : null;
}

export const feedLastUsed = (userId: number) => get<{ last_used_at: number | null }>("SELECT last_used_at FROM calendar_feeds WHERE user_id = ?", userId)?.last_used_at ?? null;
