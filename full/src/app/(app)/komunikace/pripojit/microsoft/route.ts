import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encrypt, randomToken } from "@/lib/crypto";
import { msAuthUrl, msScope } from "@/lib/mailbox/graph";
import { microsoftConfigured, schoolMicrosoft } from "@/lib/mailbox";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Začátek přihlášení účtem školy u Microsoftu (OAuth 2.0 s PKCE). Stav a ověřovací kód se drží v krátkodobém šifrovaném cookie. */
export async function GET() {
  const user = await getCurrentUser();
  const base = siteUrl() ?? "";
  if (!user) return NextResponse.redirect(new URL("/prihlaseni", base || "http://localhost"));
  if (!schoolMicrosoft(user.school_id) || !microsoftConfigured() || !base) return NextResponse.redirect(new URL("/nastaveni?k=propojeni#propojeni", base));
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  (await cookies()).set("ms_oauth", encrypt(JSON.stringify({ state, verifier, uid: user.id, exp: Date.now() + 10 * 60_000 })), { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 600, path: "/komunikace/pripojit/microsoft" });
  const q = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!.trim(), response_type: "code", redirect_uri: `${base}/komunikace/pripojit/microsoft/callback`, response_mode: "query",
    scope: msScope, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return NextResponse.redirect(`${msAuthUrl}?${q}`);
}
