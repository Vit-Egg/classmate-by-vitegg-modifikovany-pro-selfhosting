import { readJson } from "@/lib/body";
import { json, limited, oauthError, preflight, registerClient } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** RFC 7591: dynamická registrace veřejného klienta (AI aplikace). */
export async function POST(req: Request) {
  if (limited(req.headers, "oauth-register", 20)) return oauthError("temporarily_unavailable", "Příliš mnoho požadavků.", 429);
  const body = await readJson(req, 16 * 1024);
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Neplatný JSON.");
  const c = registerClient(body as Record<string, unknown>);
  if (typeof c === "string") return oauthError("invalid_redirect_uri", c);
  return json(
    {
      client_id: c.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: c.name,
      redirect_uris: c.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "classmate",
    },
    201,
  );
}
