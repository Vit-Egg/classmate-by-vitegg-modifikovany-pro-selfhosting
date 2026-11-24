/**
 * Zařízení mobilní aplikace. Aplikace zobrazuje web (přihlášení cookie), ale widget a trvalá notifikace potřebují data
 * bez otevřeného webu, proto má každé zařízení vlastní dlouhodobý token (v DB jen otisk), který jde kdykoli zrušit.
 */
import { all, get, rateLimit, run } from "./db";
import { randomToken, sha256 } from "./crypto";
import { USER_SELECT, type User } from "./session";

export const APP_UA = /ClassmateApp\/([\w.+-]+)/;
/** Kolik zařízení smí mít jeden uživatel (nejstarší se přepíšou). */
const MAX_DEVICES = 10;

export type AppDevice = { id: number; user_id: number; platform: string; name: string; fcm_token: string | null; app_version: string | null; created_at: number; last_seen_at: number | null };

export function registerDevice(userId: number, d: { platform: "android" | "ios" | "web" | "other"; name: string; fcmToken?: string | null; appVersion?: string | null }) {
  const token = randomToken(32);
  // stejné zařízení (stejný FCM token) se nepáruje dvakrát, jinak by mu chodila upozornění víckrát
  if (d.fcmToken) run("DELETE FROM app_devices WHERE fcm_token = ?", d.fcmToken);
  run(
    "INSERT INTO app_devices (user_id, token_hash, platform, name, fcm_token, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    userId, sha256(token), d.platform, d.name.slice(0, 80), d.fcmToken ?? null, d.appVersion?.slice(0, 40) ?? null, Date.now(),
  );
  const mine = all<{ id: number }>("SELECT id FROM app_devices WHERE user_id = ? ORDER BY created_at DESC, id DESC", userId);
  for (const old of mine.slice(MAX_DEVICES)) run("DELETE FROM app_devices WHERE id = ?", old.id);
  return token;
}

/** Zařízení a jeho uživatel podle hlavičky Authorization: Bearer; null při chybějícím/neplatném tokenu nebo překročení limitu. */
export function authenticateDevice(req: Request, perMinute = 60): { device: AppDevice; user: User } | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const hash = sha256(m[1]);
  const device = get<AppDevice>("SELECT id, user_id, platform, name, fcm_token, app_version, created_at, last_seen_at FROM app_devices WHERE token_hash = ?", hash);
  if (!device) return null;
  if (!rateLimit(`appdev:${device.id}`, perMinute, 60)) return null;
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, device.user_id);
  if (!user) return null;
  const now = Date.now();
  if (!device.last_seen_at || now - device.last_seen_at > 3600_000) run("UPDATE app_devices SET last_seen_at = ? WHERE id = ?", now, device.id);
  return { device, user };
}

export function updateDevice(deviceId: number, d: { fcmToken?: string | null; appVersion?: string | null }) {
  if (d.fcmToken) run("DELETE FROM app_devices WHERE fcm_token = ? AND id != ?", d.fcmToken, deviceId);
  run("UPDATE app_devices SET fcm_token = COALESCE(?, fcm_token), app_version = COALESCE(?, app_version) WHERE id = ?", d.fcmToken ?? null, d.appVersion?.slice(0, 40) ?? null, deviceId);
}

export const revokeDevice = (deviceId: number) => run("DELETE FROM app_devices WHERE id = ?", deviceId);
export const revokeUserDevice = (userId: number, deviceId: number) => run("DELETE FROM app_devices WHERE id = ? AND user_id = ?", deviceId, userId);
export const listDevices = (userId: number) => all<AppDevice>("SELECT id, user_id, platform, name, fcm_token, app_version, created_at, last_seen_at FROM app_devices WHERE user_id = ? ORDER BY created_at DESC", userId);
export const isAppRequest = (ua: string | null | undefined) => !!ua && APP_UA.test(ua);
