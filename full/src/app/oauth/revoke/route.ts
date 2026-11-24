import { readText } from "@/lib/body";
import { json, limited, preflight, revoke } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** RFC 7009: odvolání tokenu. Vždy 200, aby šlo zjistit platnost jen s tokenem. */
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (limited(req.headers, "oauth-revoke", 60)) return json({ error: "temporarily_unavailable" }, 429);
  const text = await readText(req, 16 * 1024).catch(() => "");
  let raw: Record<string, string> = {};
  try {
    raw = ct.includes("json") ? (JSON.parse(text) as Record<string, string>) : Object.fromEntries(new URLSearchParams(text));
  } catch {}
  if (raw && typeof raw.token === "string") revoke(raw.token);
  return json({});
}
