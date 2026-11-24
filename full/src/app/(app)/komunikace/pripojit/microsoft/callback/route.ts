import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { run } from "@/lib/db";
import { graphFetch, msTokenRequest, msScope } from "@/lib/mailbox/graph";
import { inDomain, schoolMicrosoft } from "@/lib/mailbox";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Návrat z Microsoftu: ověří stav, vymění kód za tokeny, zkontroluje, že účet patří škole, a uloží šifrovaný refresh token. */
export async function GET(req: NextRequest) {
  const base = siteUrl() ?? req.nextUrl.origin;
  const back = (err?: string) => NextResponse.redirect(new URL(`/nastaveni?k=propojeni${err ? `&chyba=${err}` : ""}#propojeni`, base));
  const user = await getCurrentUser();
  const jar = await cookies();
  const raw = jar.get("ms_oauth")?.value;
  jar.delete({ name: "ms_oauth", path: "/komunikace/pripojit/microsoft" });
  if (!user || !raw) return back("stav");
  let saved: { state: string; verifier: string; uid: number; exp: number };
  try {
    saved = JSON.parse(decrypt(raw));
  } catch {
    return back("stav");
  }
  const p = req.nextUrl.searchParams;
  if (saved.uid !== user.id || saved.exp < Date.now() || p.get("state") !== saved.state) return back("stav");
  if (p.get("error")) return back(p.get("error") === "access_denied" ? "zamitnuto" : "microsoft");
  const code = p.get("code");
  const domain = schoolMicrosoft(user.school_id);
  if (!code || !domain) return back("microsoft");
  try {
    const t = await msTokenRequest({ grant_type: "authorization_code", code, redirect_uri: `${base}/komunikace/pripojit/microsoft/callback`, code_verifier: saved.verifier, scope: msScope });
    if (!t.refresh) return back("microsoft");
    const me = (await (await graphFetch(t.access, "/me?$select=mail,userPrincipalName")).json()) as { mail?: string; userPrincipalName?: string };
    const address = (me.mail || me.userPrincipalName || "").toLowerCase();
    if (!address || !inDomain(address, domain)) return back("domena");
    run("INSERT OR REPLACE INTO mail_accounts (user_id, kind, address, secret_enc, created_at, last_ok_at) VALUES (?, 'microsoft', ?, ?, ?, ?)", user.id, address, encrypt(t.refresh), Date.now(), Date.now());
  } catch {
    return back("microsoft");
  }
  return back();
}
