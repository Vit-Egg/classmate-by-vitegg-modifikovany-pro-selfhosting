import { redirect } from "next/navigation";
import { setupAction } from "../actions";
import { needsSetup, setupToken } from "@/lib/auth";

export const metadata = { title: "První spuštění" };
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!needsSetup()) redirect("/prihlaseni");
  setupToken(); // vypíše kód do logu, pokud není v .env
  const sp = await searchParams;
  return (
    <div className="auth">
      <h1>První spuštění</h1>
      <p className="sub">Nastav heslo ke svému serveru. Účet je jen jeden.</p>
      <div className="card hint" style={{ marginBottom: 14 }}>
        Neoficiální klient pro tvůj vlastní účet v Bakalářích. Jen čte, data zůstávají na tvém serveru. Neprovozuj ho pro jiné lidi a používej ho na vlastní odpovědnost.
      </div>
      {sp.e && <div className="msg e" role="alert">{sp.e}</div>}
      <form action={setupAction} className="form card">
        <label><span>Instalační kód (SETUP_TOKEN nebo z logu serveru)</span><input name="token" autoComplete="off" required /></label>
        <label><span>Heslo (aspoň 10 znaků)</span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
        <label><span>Heslo znovu</span><input name="password2" type="password" autoComplete="new-password" minLength={10} required /></label>
        <div><button className="btn primary">Pokračovat</button></div>
      </form>
    </div>
  );
}
