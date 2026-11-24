import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { TodoistError, connectTodoist, todoistExchangeCode, todoistOAuthConfigured } from "@/lib/todoist";

export const dynamic = "force-dynamic";

/** Návrat z Todoistu: ověří stav, vymění kód za token a propojí účet. */
export async function GET(req: NextRequest) {
  const base = siteUrl();
  const back = (td: string) => NextResponse.redirect(new URL(`/nastaveni?k=propojeni&td=${td}#todoist`, base));
  const user = await getCurrentUser();
  const jar = await cookies();
  const raw = jar.get("td_oauth")?.value;
  jar.delete({ name: "td_oauth", path: "/nastaveni/todoist" });
  if (!user || !raw || !todoistOAuthConfigured()) return back("stav");
  let saved: { state: string; uid: number; project: string; exp: number };
  try {
    saved = JSON.parse(decrypt(raw));
  } catch {
    return back("stav");
  }
  const p = req.nextUrl.searchParams;
  if (saved.uid !== user.id || saved.exp < Date.now() || p.get("state") !== saved.state) return back("stav");
  if (p.get("error")) return back(p.get("error") === "access_denied" ? "zamitnuto" : "todoist");
  const code = p.get("code");
  if (!code || !rateLimit(`todoist:connect:${user.id}`, 8, 900)) return back("todoist");
  try {
    const t = await todoistExchangeCode(code);
    await connectTodoist(user, t.access, saved.project, "oauth", { refresh: t.refresh, expiresAt: t.expiresAt });
  } catch (e) {
    if (e instanceof TodoistError) return back("todoist");
    throw e;
  }
  return back("ok");
}
