import { newSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { partitionedCookie, redeemLoginToken } from "@/lib/embed/core";

/** Rám v Classmate vymění jednorázový token z okna s přihlášením za relaci v dělené cookie (platí jen pro vložení v Classmate). */
export async function POST(req: Request) {
  const token = (await req.text()).slice(0, 200).trim();
  if (redeemLoginToken(token) == null) return new Response("Neplatný nebo prošlý token.", { status: 403 });
  return new Response(null, { status: 204, headers: { "Set-Cookie": partitionedCookie(SESSION_COOKIE, newSession(), SESSION_DAYS * 86_400), "Cache-Control": "no-store" } });
}
