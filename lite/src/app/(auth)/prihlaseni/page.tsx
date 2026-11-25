import { redirect } from "next/navigation";
import { loginAction } from "../../actions";
import { CmLogin } from "@/components/CmLogin";
import { loggedIn, needsSetup } from "@/lib/auth";

export const metadata = { title: "Přihlášení" };
export const dynamic = "force-dynamic";

/** V rámu Classmate se místo formuláře ukáže tlačítko, které otevře přihlášení v novém okně (cookie z formuláře v rámu by prohlížeč zahodil). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  if (needsSetup()) redirect("/zprovozneni");
  const sp = await searchParams;
  const next = /^\/(?![/\\])/.test(sp.next ?? "") ? sp.next! : "";
  if (await loggedIn()) redirect(next || "/dnes");
  return (
    <>
      <CmLogin name="Classmate lite" />
      <div className="cm-login-form">
        <h1>Přihlášení</h1>
        {sp.e && <p className="msg-error" role="alert" style={{ marginBottom: 14 }}>{sp.e}</p>}
        <form action={loginAction} className="stack">
          <input type="hidden" name="next" value={next} />
          <label className="field"><span>Heslo</span><input className="input" name="password" type="password" autoComplete="current-password" autoFocus required /></label>
          <div style={{ height: 8 }} />
          <button className="btn primary big">Přihlásit se</button>
        </form>
      </div>
    </>
  );
}
