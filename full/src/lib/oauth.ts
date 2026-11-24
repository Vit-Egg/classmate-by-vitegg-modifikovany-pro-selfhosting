/** Minimální OAuth 2.1 autorizační server pro MCP: dynamická registrace klientů, authorization code + PKCE (S256), refresh tokeny. */
import { configuredUrl } from "./site";
import crypto from "node:crypto";
import { get, run, rateLimit } from "./db";
import { randomToken, sha256 } from "./crypto";
import { USER_SELECT, type User } from "./session";

export const ACCESS_TTL = 3600_000;
export const REFRESH_TTL = 30 * 86_400_000;
const CODE_TTL = 10 * 60_000;

/** Veřejná adresa aplikace. Za proxy/tunelem je spolehlivější nastavit PUBLIC_URL. */
export function originOf(h: Headers, fallbackUrl?: string) {
  const configured = configuredUrl();
  if (configured) return configured;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (fallbackUrl ? new URL(fallbackUrl).protocol.replace(":", "") : "https");
  return host ? `${proto}://${host}` : new URL(fallbackUrl!).origin;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });
export const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

export function limited(h: Headers, bucket: string, max = 60) {
  // hlavičky od klienta jdou předstírat; důvěřuje se jen CF-Connecting-IP za Cloudflare Tunnelem (TRUST_CLOUDFLARE=true)
  const ip = (process.env.TRUST_CLOUDFLARE === "true" ? h.get("cf-connecting-ip") : null) ?? h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  return !rateLimit(`${bucket}:${ip}`, max, 60);
}

/* ---------- klienti ---------- */

export type Client = { id: string; name: string; redirect_uris: string[] };

/** https, localhost přes http a vlastní schémata aplikací (např. cursor://); nic nebezpečného. */
export function validRedirectUri(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:"].includes(u.protocol);
  } catch {
    return false;
  }
}

export function registerClient(body: Record<string, unknown>): Client | string {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirectUri)) return "Neplatné redirect_uris.";
  const name = (typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "Neznámá aplikace").slice(0, 80);
  run("DELETE FROM oauth_clients WHERE created_at < ? AND id NOT IN (SELECT client_id FROM oauth_tokens)", Date.now() - 7 * 86_400_000);
  // dynamická registrace je bez přihlášení, takže počet nepoužívaných klientů je shora omezený (jinak by šla zahltit databáze)
  if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM oauth_clients")?.n ?? 0) >= 2000) return "Server má teď zaregistrovaných příliš mnoho aplikací, zkus to později.";
  const id = "skc_" + randomToken(18);
  run("INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)", id, name, JSON.stringify(uris), Date.now());
  return { id, name, redirect_uris: uris };
}

export function getClient(id: string | null | undefined): Client | null {
  if (!id) return null;
  const row = get<{ id: string; name: string; redirect_uris: string }>("SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?", id);
  return row ? { id: row.id, name: row.name, redirect_uris: JSON.parse(row.redirect_uris) } : null;
}

/* ---------- autorizační kód ---------- */

export function createCode(clientId: string, userId: number, redirectUri: string, challenge: string) {
  const code = "skx_" + randomToken(32);
  run("DELETE FROM oauth_codes WHERE expires_at < ?", Date.now());
  run("INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)", sha256(code), clientId, userId, redirectUri, challenge, Date.now() + CODE_TTL);
  return code;
}

const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function issue(clientId: string, userId: number, replaceId?: number) {
  const access = "skat_" + randomToken(32);
  const refresh = "skrt_" + randomToken(32);
  const now = Date.now();
  if (replaceId) {
    run("UPDATE oauth_tokens SET access_hash = ?, refresh_hash = ?, access_expires = ?, refresh_expires = ?, last_used_at = ? WHERE id = ?", sha256(access), sha256(refresh), now + ACCESS_TTL, now + REFRESH_TTL, now, replaceId);
  } else {
    run("INSERT INTO oauth_tokens (client_id, user_id, access_hash, refresh_hash, access_expires, refresh_expires, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", clientId, userId, sha256(access), sha256(refresh), now + ACCESS_TTL, now + REFRESH_TTL, now, now);
  }
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: "classmate" };
}

export function exchangeCode(p: { code: string; verifier: string; clientId: string; redirectUri: string }) {
  const row = get<{ client_id: string; user_id: number; redirect_uri: string; code_challenge: string; expires_at: number }>("SELECT * FROM oauth_codes WHERE code_hash = ?", sha256(p.code));
  run("DELETE FROM oauth_codes WHERE code_hash = ?", sha256(p.code)); // kód je jednorázový, i když výměna selže
  if (!row || row.expires_at < Date.now() || row.client_id !== p.clientId || row.redirect_uri !== p.redirectUri) return null;
  const challenge = crypto.createHash("sha256").update(p.verifier).digest("base64url");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(p.verifier) || !safeEqual(challenge, row.code_challenge)) return null;
  return issue(row.client_id, row.user_id);
}

export function refresh(token: string, clientId: string) {
  const row = get<{ id: number; client_id: string; user_id: number; refresh_expires: number }>("SELECT id, client_id, user_id, refresh_expires FROM oauth_tokens WHERE refresh_hash = ?", sha256(token));
  if (!row || row.client_id !== clientId || row.refresh_expires < Date.now()) return null;
  return issue(row.client_id, row.user_id, row.id);
}

export function revoke(token: string) {
  const h = sha256(token);
  run("DELETE FROM oauth_tokens WHERE access_hash = ? OR refresh_hash = ?", h, h);
}

/** Uživatel podle přístupového tokenu, nebo null. */
export function userForToken(token: string): User | null {
  if (!token.startsWith("skat_")) return null;
  const row = get<{ id: number; user_id: number; access_expires: number; last_used_at: number | null }>("SELECT id, user_id, access_expires, last_used_at FROM oauth_tokens WHERE access_hash = ?", sha256(token));
  if (!row || row.access_expires < Date.now()) return null;
  if (!row.last_used_at || Date.now() - row.last_used_at > 60_000) run("UPDATE oauth_tokens SET last_used_at = ? WHERE id = ?", Date.now(), row.id);
  return get<User>(`${USER_SELECT} WHERE u.id = ?`, row.user_id) ?? null;
}

/** Požadavek na autorizaci musí být plně platný, než ho ukážeme uživateli (a než na cokoliv přesměrujeme). */
export function validateAuthRequest(sp: Record<string, string | undefined>) {
  const client = getClient(sp.client_id);
  if (!client) return { error: "Neznámá aplikace. Zkus ji připojit znovu." } as const;
  if (!sp.redirect_uri || !client.redirect_uris.includes(sp.redirect_uri)) return { error: "Adresa pro návrat nesedí s registrací aplikace." } as const;
  if (sp.response_type !== "code") return { error: "Podporujeme jen response_type=code." } as const;
  if (!sp.code_challenge || sp.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(sp.code_challenge)) return { error: "Chybí PKCE (S256)." } as const;
  return { client, redirectUri: sp.redirect_uri, challenge: sp.code_challenge, state: sp.state } as const;
}
