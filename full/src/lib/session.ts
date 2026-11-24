import { pragueNow } from "./dates";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "sid";
const TTL = 30 * 24 * 3600 * 1000;
/** I aktivně používané přihlášení po této době vyprší (ukradený cookie tak nemůže platit donekonečna). */
const MAX_AGE = 120 * 24 * 3600 * 1000;
const secure = () => (process.env.COOKIE_SECURE ?? String(process.env.NODE_ENV === "production")) === "true";

export type User = {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  share_notes: number;
  note_title_template: string | null;
  share_marks_stats: number | null;
  shortcuts: string | null;
  ui_prefs: string | null;
  email_notify: "off" | "instant" | "digest";
  email_confirmed_for: string | null;
  email_gate: number;
  school_id: number;
  class_id: number;
  school_name: string;
  class_name: string;
  bakalari_url: string | null;
  bakalari_username: string | null;
  bakalari_refresh_enc: string | null;
  last_sync_at: number | null;
  totp_enabled: number;
  created_at: number;
  /** 1 = ukázkový účet s vymyšlenými daty (src/lib/demo.ts) */
  demo: number;
  /** kdy se ukázkový účet smaže (null = trvalý) */
  demo_expires_at: number | null;
  /** je pokladník své třídy (platí jen při zapnuté Pokladně) */
  treasurer: number;
  /** má třída zapnutou Pokladnu */
  cash_enabled: number;
  /** má třída zapnuté Třídní služby */
  duty_enabled: number;
  board_enabled: number;
};

export const USER_SELECT = `
  SELECT u.id, u.email, u.name, u.role, u.share_notes, u.note_title_template, u.share_marks_stats, u.shortcuts, u.ui_prefs, u.email_notify, u.email_confirmed_for, u.email_gate, u.school_id, u.class_id, s.name AS school_name, c.name AS class_name,
         s.bakalari_url, u.bakalari_username, u.bakalari_refresh_enc, u.last_sync_at, u.totp_enabled, u.created_at, u.demo, u.demo_expires_at, u.treasurer, c.cash_enabled, c.duty_enabled, c.board_enabled
  FROM users u JOIN schools s ON s.id = u.school_id JOIN classes c ON c.id = u.class_id`;

export async function createSession(userId: number) {
  // nové přihlášení vždy dostane nový token; případné staré přihlášení z tohoto prohlížeče se zruší (ochrana proti podstrčenému cookie)
  const old = (await cookies()).get(COOKIE)?.value;
  if (old) run("DELETE FROM sessions WHERE id = ?", sha256(old));
  const token = randomToken(32);
  const now = Date.now();
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)", sha256(token), userId, now, now, now + TTL, ua);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: TTL / 1000 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE id = ?", sha256(token));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const sess = get<{ user_id: number; expires_at: number; last_seen: number; created_at: number }>("SELECT user_id, expires_at, last_seen, created_at FROM sessions WHERE id = ?", id);
  if (!sess) return null;
  const now = Date.now();
  if (sess.expires_at < now || now - sess.created_at > MAX_AGE) {
    run("DELETE FROM sessions WHERE id = ?", id);
    return null;
  }
  if (now - sess.last_seen > 3600_000) run("UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?", now, Math.min(now + TTL, sess.created_at + MAX_AGE), id);
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, sess.user_id) ?? null;
  // ukázkový účet po vypršení přestává platit (smaže ho úklid)
  if (user?.demo_expires_at && user.demo_expires_at < now) return null;
  return user;
});

/** Zapíše, že uživatel právě otevřel stránku aplikace (nejvýš jednou za 5 minut). Synchronizace na pozadí ani AI se nepočítají.
 *  Při zápisu se zároveň počítá aktivita do denních a hodinových souhrnů pro statistiky ve Správě (demo se nepočítá). */
export function touchActive(userId: number, demo = false) {
  const now = Date.now();
  const r = run("UPDATE users SET last_active_at = ? WHERE id = ? AND (last_active_at IS NULL OR last_active_at < ?)", now, userId, now - 300_000);
  if (r.changes && !demo) {
    try {
      run("INSERT OR IGNORE INTO usage_daily (day, user_id) VALUES (?, ?)", pragueNow(new Date(now)).date, userId);
      run("INSERT INTO usage_hourly (slot, hits) VALUES (?, 1) ON CONFLICT(slot) DO UPDATE SET hits = hits + 1", Math.floor(now / 3600_000) * 3600_000);
    } catch {}
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlaseni");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dnes");
  return user;
}

export async function clientIp() {
  const h = await headers();
  // Za Cloudflare Tunnelem je jediná důvěryhodná IP v CF-Connecting-IP (X-Forwarded-For si může klient předvyplnit).
  if (process.env.TRUST_CLOUDFLARE === "true") {
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf;
  }
  // bez Cloudflare je první adresa v X-Forwarded-For od klienta (jde podvrhnout), důvěryhodná je ta, kterou připsala naše proxy, tedy poslední
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "unknown";
}
