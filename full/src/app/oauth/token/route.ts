import { readText } from "@/lib/body";
import { exchangeCode, json, limited, oauthError, preflight, refresh, getClient } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: Request) {
  if (limited(req.headers, "oauth-token", 60)) return oauthError("temporarily_unavailable", "Příliš mnoho požadavků.", 429);
  const ct = req.headers.get("content-type") ?? "";
  const text = await readText(req, 16 * 1024).catch(() => null);
  if (text == null) return oauthError("invalid_request", "Požadavek je moc velký.", 413);
  let raw: Record<string, string> = {};
  try {
    raw = ct.includes("json") ? (JSON.parse(text) as Record<string, string>) : Object.fromEntries(new URLSearchParams(text));
  } catch {}
  if (!raw || typeof raw !== "object") raw = {};
  const clientId = raw.client_id;
  if (!getClient(clientId)) return oauthError("invalid_client", "Neznámý klient.", 401);

  if (raw.grant_type === "authorization_code") {
    if (!raw.code || !raw.code_verifier || !raw.redirect_uri) return oauthError("invalid_request", "Chybí code, code_verifier nebo redirect_uri.");
    const t = exchangeCode({ code: raw.code, verifier: raw.code_verifier, clientId, redirectUri: raw.redirect_uri });
    return t ? json(t) : oauthError("invalid_grant", "Kód je neplatný, použitý nebo vypršel.");
  }
  if (raw.grant_type === "refresh_token") {
    const t = raw.refresh_token ? refresh(raw.refresh_token, clientId) : null;
    return t ? json(t) : oauthError("invalid_grant", "Refresh token je neplatný nebo vypršel.");
  }
  return oauthError("unsupported_grant_type", "Podporujeme authorization_code a refresh_token.");
}
