import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { encrypt, randomToken } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { todoistAuthUrl, todoistOAuthConfigured } from "@/lib/todoist";

export const dynamic = "force-dynamic";

/** Začátek přihlášení přes Todoist (OAuth). Stav a název projektu se drží v krátkodobém šifrovaném cookie. */
export async function GET(req: NextRequest) {
  const base = siteUrl();
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/prihlaseni", base));
  if (!todoistOAuthConfigured()) return NextResponse.redirect(new URL("/nastaveni?k=propojeni&td=nenastaveno#todoist", base));
  const state = randomToken(16);
  const project = (req.nextUrl.searchParams.get("project") ?? "").trim().slice(0, 120);
  (await cookies()).set("td_oauth", encrypt(JSON.stringify({ state, uid: user.id, project, exp: Date.now() + 10 * 60_000 })), { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 600, path: "/nastaveni/todoist" });
  return NextResponse.redirect(todoistAuthUrl(state));
}
