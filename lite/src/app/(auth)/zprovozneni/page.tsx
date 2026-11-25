import { redirect } from "next/navigation";
import { setupAction } from "../../actions";
import { needsSetup, setupToken } from "@/lib/auth";

export const metadata = { title: "První spuštění" };
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!needsSetup()) redirect("/prihlaseni");
  setupToken(); // vypíše kód do logu, pokud není v .env
  const sp = await searchParams;
  return (
    <>
      <h1>První spuštění</h1>
      <p className="hint" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Neoficiální klient pro tvůj vlastní účet v Bakalářích. Jen čte, data zůstávají na tvém serveru. Neprovozuj ho pro jiné lidi a používej ho na vlastní odpovědnost.
      </p>
      {sp.e && <p className="msg-error" role="alert" style={{ marginBottom: 14 }}>{sp.e}</p>}
      <form action={setupAction} className="stack">
        <label className="field"><span>Instalační kód (SETUP_TOKEN nebo z logu serveru)</span><input className="input" name="token" autoComplete="off" required /></label>
        <label className="field"><span>Heslo (aspoň 10 znaků)</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
        <label className="field"><span>Heslo znovu</span><input className="input" name="password2" type="password" autoComplete="new-password" minLength={10} required /></label>
        <div style={{ height: 8 }} />
        <button className="btn primary big">Pokračovat</button>
      </form>
    </>
  );
}
