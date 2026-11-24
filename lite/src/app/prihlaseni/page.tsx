import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { loggedIn, needsSetup } from "@/lib/auth";

export const metadata = { title: "Přihlášení" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  if (needsSetup()) redirect("/zprovozneni");
  if (await loggedIn()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="auth">
      <h1>Classmate lite</h1>
      <p className="sub">Bakaláři a obědy · tvůj vlastní server</p>
      {sp.e && <div className="msg e" role="alert">{sp.e}</div>}
      <form action={loginAction} className="form card">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <label><span>Heslo</span><input name="password" type="password" autoComplete="current-password" autoFocus required /></label>
        <div><button className="btn primary">Přihlásit se</button></div>
      </form>
    </div>
  );
}
