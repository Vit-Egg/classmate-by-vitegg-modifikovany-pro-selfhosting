import { changePasswordAction, connectBakalariAction, connectStravaAction, disconnectBakalariAction, disconnectStravaAction, logoutAction } from "../../actions";
import { ThemePick } from "@/components/ThemePick";
import { bkConfigured, bkInfo } from "@/lib/bk";
import { ME } from "@/lib/db";
import { stravaAccount } from "@/lib/strava";
import { Flash, Head, type SP } from "../ui";

export const metadata = { title: "Nastavení" };

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const info = bkInfo();
  const strava = stravaAccount(ME);
  return (
    <div className="wide">
      <Head title="Nastavení" sub="Tenhle server je jen tvůj: jeden účet, žádní další uživatelé." />
      <Flash sp={sp} />
      <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Bakaláři</h2>
          <div className="card card-pad stack">
            {bkConfigured() ? (
              <>
                <div className="kv" style={{ padding: 0 }}>
                  <div><strong>{info.name || info.user}{info.cls ? ` · ${info.cls}` : ""}</strong><small>{info.url}</small></div>
                  <span className="badge accent">propojeno</span>
                </div>
                <form action={disconnectBakalariAction}><button className="btn small danger">Odpojit a smazat data</button></form>
              </>
            ) : (
              <form action={connectBakalariAction} className="stack">
                <label className="field"><span>Adresa Bakalářů školy</span><input className="input" name="url" placeholder="https://bakalari.skola.cz" defaultValue={info.url ?? ""} required /></label>
                <label className="field"><span>Uživatelské jméno</span><input className="input" name="user" autoComplete="username" required /></label>
                <label className="field"><span>Heslo</span><input className="input" name="pass" type="password" autoComplete="current-password" required /></label>
                <p className="hint" style={{ margin: 0 }}>Heslo se neukládá, server si drží jen šifrovaný přihlašovací token. Z Bakalářů se jen čte.</p>
                <div><button className="btn primary">Propojit</button></div>
              </form>
            )}
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Strava.cz</h2>
          <div className="card card-pad stack">
            {strava ? (
              <>
                <div className="kv" style={{ padding: 0 }}>
                  <div><strong>Jídelna {strava.canteen}</strong><small>{strava.anon ? "jen jídelníček" : `účet ${strava.username}, objednávání zapnuté`}</small></div>
                  <span className="badge accent">propojeno</span>
                </div>
                <form action={disconnectStravaAction}><button className="btn small danger">Odpojit</button></form>
              </>
            ) : (
              <form action={connectStravaAction} className="stack">
                <label className="field"><span>Číslo jídelny</span><input className="input" name="canteen" inputMode="numeric" placeholder="1234" required /></label>
                <label className="field"><span>Uživatelské jméno (nepovinné)</span><input className="input" name="user" autoComplete="off" /></label>
                <label className="field"><span>Heslo (nepovinné)</span><input className="input" name="pass" type="password" autoComplete="off" /></label>
                <p className="hint" style={{ margin: 0 }}>Bez jména a hesla uvidíš jen jídelníček, s nimi i kredit a objednávky. Strava.cz nemá přihlašovací token, heslo se proto ukládá šifrovaně.</p>
                <div><button className="btn primary">Propojit</button></div>
              </form>
            )}
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Vzhled</h2>
          <div className="card card-pad"><ThemePick /></div>
          <p className="hint" style={{ margin: "10px 4px 0" }}>Uvnitř Classmate se motiv a barva berou z Classmate.</p>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Účet</h2>
          <div className="card card-pad stack">
            <form action={changePasswordAction} className="stack">
              <label className="field"><span>Současné heslo</span><input className="input" name="old" type="password" autoComplete="current-password" required /></label>
              <label className="field"><span>Nové heslo (aspoň 10 znaků)</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
              <div><button className="btn">Změnit heslo</button></div>
            </form>
            <form action={logoutAction}><button className="btn small">Odhlásit se</button></form>
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Upozornění</h2>
          <div className="card card-pad">
            <p style={{ margin: 0 }}>
              {process.env.NTFY_URL ? <>Upozornění chodí přes ntfy.</> : <>Nastav <code>NTFY_URL</code> v <code>.env</code> a dostaneš upozornění na nové známky, změny v rozvrhu, absenci a zprávy Komens.</>}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
