import { changePasswordAction, connectBakalariAction, connectStravaAction, disconnectBakalariAction, disconnectStravaAction, logoutAction } from "../../actions";
import { bkConfigured, bkInfo } from "@/lib/bk";
import { ME } from "@/lib/db";
import { stravaAccount } from "@/lib/strava";
import { Flash, type SP } from "../ui";

export const metadata = { title: "Nastavení" };

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const info = bkInfo();
  const strava = stravaAccount(ME);
  return (
    <>
      <h1>Nastavení</h1>
      <p className="sub">Tenhle server je jen tvůj: jeden účet, žádní další uživatelé.</p>
      <Flash sp={sp} />

      <h2>Bakaláři</h2>
      <div className="card stack">
        {bkConfigured() ? (
          <>
            <p style={{ margin: 0 }}>
              Propojeno jako <b>{info.name || info.user}</b>
              {info.cls ? ` (${info.cls})` : ""} · <span className="mut">{info.url}</span>
            </p>
            <form action={disconnectBakalariAction}>
              <button className="btn danger small">Odpojit a smazat data</button>
            </form>
          </>
        ) : (
          <form action={connectBakalariAction} className="form">
            <label><span>Adresa Bakalářů školy</span><input name="url" placeholder="https://bakalari.skola.cz" defaultValue={info.url ?? ""} required /></label>
            <label><span>Uživatelské jméno</span><input name="user" autoComplete="username" required /></label>
            <label><span>Heslo</span><input name="pass" type="password" autoComplete="current-password" required /></label>
            <p className="hint" style={{ margin: 0 }}>Heslo se neukládá, server si drží jen šifrovaný přihlašovací token. Aplikace z Bakalářů jen čte.</p>
            <div><button className="btn primary">Propojit</button></div>
          </form>
        )}
      </div>

      <h2>Strava.cz</h2>
      <div className="card stack">
        {strava ? (
          <>
            <p style={{ margin: 0 }}>
              Jídelna <b>{strava.canteen}</b> · {strava.anon ? "jen jídelníček" : <>účet <b>{strava.username}</b>, objednávání zapnuté</>}
            </p>
            <form action={disconnectStravaAction}>
              <button className="btn danger small">Odpojit</button>
            </form>
          </>
        ) : (
          <form action={connectStravaAction} className="form">
            <label><span>Číslo jídelny</span><input name="canteen" inputMode="numeric" placeholder="1234" required /></label>
            <label><span>Uživatelské jméno (nepovinné)</span><input name="user" autoComplete="off" /></label>
            <label><span>Heslo (nepovinné)</span><input name="pass" type="password" autoComplete="off" /></label>
            <p className="hint" style={{ margin: 0 }}>Bez jména a hesla uvidíš jen jídelníček. S nimi i kredit a můžeš objednávat. Strava.cz nemá přihlašovací token, proto se heslo ukládá šifrovaně (APP_SECRET).</p>
            <div><button className="btn primary">Propojit</button></div>
          </form>
        )}
      </div>

      <h2>Účet</h2>
      <div className="card stack">
        <form action={changePasswordAction} className="form">
          <label><span>Současné heslo</span><input name="old" type="password" autoComplete="current-password" required /></label>
          <label><span>Nové heslo (aspoň 10 znaků)</span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
          <div><button className="btn">Změnit heslo</button></div>
        </form>
        <form action={logoutAction}>
          <button className="btn small">Odhlásit se</button>
        </form>
      </div>

      <h2>Upozornění</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          {process.env.NTFY_URL ? <>Upozornění jdou přes ntfy na <code>{process.env.NTFY_URL.replace(/\/[^/]+$/, "/…")}</code>.</> : <>Nastav <code>NTFY_URL</code> v <code>.env</code> a dostaneš upozornění na nové známky, změny v rozvrhu, absenci a zprávy Komens.</>}
        </p>
      </div>
    </>
  );
}
