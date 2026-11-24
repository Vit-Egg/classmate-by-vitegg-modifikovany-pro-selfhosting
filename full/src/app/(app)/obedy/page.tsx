import Link from "next/link";
import { orderMeal } from "@/app/actions/obedy";
import { Submit } from "@/components/forms";
import { dayName, dowOf, fmtShort, pragueNow } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { StravaError, stravaAccount, stravaMenu, type Day } from "@/lib/strava";

export const metadata = { title: "Obědy" };
export const dynamic = "force-dynamic";

const kc = (n: number) => `${n.toFixed(2).replace(".", ",").replace(",00", "")} Kč`;
const deadline = (s: string) => {
  const t = Date.parse(s);
  return t ? new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(t) : "";
};

export default async function LunchPage({ searchParams }: { searchParams: Promise<{ chyba?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const head = (sub: string) => (
    <div className="page-head"><div><h1 className="title">Obědy</h1><p className="subtitle">{sub}</p></div></div>
  );
  if (!stravaAccount(user.id)) {
    return (
      <div className="wide">
        {head("Jídelníček a objednávky ze Strava.cz")}
        <div className="card card-pad comm-connect">
          <h2 className="section" style={{ marginBottom: 6 }}>Strava.cz zatím není zapnutá</h2>
          <p className="hint" style={{ margin: "0 0 16px" }}>Obědy si zapínáš sám v Nastavení, stačí číslo jídelny a přihlašovací údaje ke Strava.cz.</p>
          <Link href="/nastaveni?k=propojeni#strava" className="btn primary">Zapnout v Nastavení</Link>
        </div>
      </div>
    );
  }
  let days: Day[] = [];
  let credit = 0;
  let canteenName = "";
  let anon = false;
  let problem = "";
  try {
    const r = await stravaMenu(user.id);
    days = r.days;
    credit = r.credit;
    canteenName = r.session.canteenName;
    anon = r.anon;
  } catch (e) {
    problem = e instanceof StravaError ? e.message : "Jídelníček se nepodařilo načíst.";
  }
  const today = pragueNow().date;
  const upcoming = days.filter((d) => d.date >= today && (d.meals.length || d.closed)).slice(0, 21);

  return (
    <div className="wide">
      {head(canteenName || "Jídelníček a objednávky ze Strava.cz")}
      {(sp.chyba || problem) && <p className="msg-error" role="alert">{sp.chyba || problem}</p>}
      {!problem && (
        <>
          {anon ? (
            <div className="card study-banner" style={{ maxWidth: 640 }}>
              <div><b>Jídelníček bez přihlášení</b><small>Kredit a objednávky uvidíš po přihlášení ke Strava.cz.</small></div>
              <Link href="/nastaveni?k=propojeni#strava" className="btn small">Přihlásit se</Link>
            </div>
          ) : (
            <div className="stat-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 420 }}>
              <div className="stat"><small>Kredit</small><b>{kc(credit)}</b></div>
              <div className="stat"><small>Objednáno</small><b>{upcoming.reduce((n, d) => n + d.meals.filter((m) => m.ordered).length, 0)}</b></div>
            </div>
          )}
          {upcoming.length ? (
            <div className="auto-cols">
              {upcoming.map((d) => (
                <section key={d.date}>
                  <h2 className="group-title">{dayName(dowOf(d.date))} {fmtShort(d.date)}{d.date === today ? " · dnes" : ""}</h2>
                  {d.closed || !d.meals.length ? <div className="empty">Jídelna nevaří.</div> : (
                    <div className="card rows">
                      {d.meals.map((m) => (
                        <div key={`${m.id}-${m.name}`} className={`item meal${m.ordered ? " ordered" : ""}`}>
                          <div className="item-main">
                            <div className="item-title">{m.name}</div>
                            <div className="item-meta">
                              <span className="chip plain">{m.soup ? "Polévka" : m.label}</span>
                              {m.price > 0 && <span>{kc(m.price)}</span>}
                              {m.ordered && <span className="chip">objednáno</span>}
                              {m.deadline && (m.canOrder || m.canCancel) && <span>do {deadline(m.deadline)}</span>}
                              {m.allergens.length > 0 && <span title={m.allergens.join(", ")}>alergeny: {m.allergens.length}</span>}
                            </div>
                          </div>
                          {!m.soup && ((m.ordered && m.canCancel) || (!m.ordered && m.canOrder)) && (
                            <form action={orderMeal}>
                              <input type="hidden" name="meal" value={m.id} />
                              <input type="hidden" name="want" value={m.ordered ? "0" : "1"} />
                              <input type="hidden" name="name" value={m.name} />
                              <Submit className={`btn small${m.ordered ? "" : " primary"}`} pendingText={m.ordered ? "Ruším…" : "Ukládám…"}>{m.ordered ? "Zrušit" : "Objednat"}</Submit>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : <div className="empty">Jídelníček zatím nic nenabízí.</div>}
          <p className="hint" style={{ marginTop: 18 }}>{anon ? "" : "Jídelny si objednávky předávají s prodlevou, změna se v Strava.cz může propsat později. "} Propojení spravuješ v <Link href="/nastaveni?k=propojeni#strava" className="link-u">Nastavení</Link>.</p>
        </>
      )}
    </div>
  );
}
