import { partitionedCookie, redeemLoginToken } from "@/lib/embed/core";
import { newFrameSession } from "@/lib/session";

/** Rám v Classmate vymění jednorázový token z okna s přihlášením za relaci v dělené cookie (platí jen pro vložení v Classmate). */
export async function POST(req: Request) {
  const userId = redeemLoginToken((await req.text()).slice(0, 200).trim());
  if (userId == null) return new Response("Neplatný nebo prošlý token.", { status: 403 });
  const s = newFrameSession(userId, req.headers.get("user-agent"));
  return new Response(null, { status: 204, headers: { "Set-Cookie": partitionedCookie(s.cookie, s.token, s.maxAge), "Cache-Control": "no-store" } });
}
