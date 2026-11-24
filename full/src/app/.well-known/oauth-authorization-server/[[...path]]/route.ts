import { CORS, json, originOf, preflight } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** RFC 8414: metadata autorizačního serveru. */
export async function GET(req: Request) {
  const o = originOf(req.headers, req.url);
  return json(
    {
      issuer: o,
      authorization_endpoint: `${o}/oauth/authorize`,
      token_endpoint: `${o}/oauth/token`,
      registration_endpoint: `${o}/oauth/register`,
      revocation_endpoint: `${o}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["classmate"],
    },
    200,
    CORS,
  );
}
