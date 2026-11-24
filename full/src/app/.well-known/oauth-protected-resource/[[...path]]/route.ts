import { CORS, json, originOf, preflight } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** RFC 9728: kde je chráněný zdroj (MCP) a kdo vydává tokeny. */
export async function GET(req: Request) {
  const origin = originOf(req.headers, req.url);
  return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["classmate"], resource_name: "Škola" }, 200, CORS);
}
