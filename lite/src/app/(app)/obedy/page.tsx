import Link from "next/link";
import { orderAction } from "../../actions";
import { ME } from "@/lib/db";
import { dayName, dowOf, fmtShort, pragueNow } from "@/lib/dates";
import { StravaError, stravaAccount, stravaMenu, type Day } from "@/lib/strava";
import { Flash, Head, type SP } from "../ui";

export const metadata = { title: "Obědy" };

const kc = (n: number) => `${n.toFixed(2).replace(".", ",").replace(",00", "")} Kč`;
const deadline = (s: string) => {
  const t = Date.parse(s);
  return t ? new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(t) : "";
};

export default async function LunchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (!stravaAccount(ME)) {
    return (
      <div className="wide">
        <Head title="Obědy" sub="Jídelníček a objednávky ze Strava.cz" />
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <h2 className="section" style={{ marginBottom: 6 }}>Strava.cz zatím není zapnutá</h2>
          <p className="hint" style={{ margin: "0 0 16px" }}>Stačí číslo jídelny, se jménem a heslem i kredit a objednávky.</p>
          <Link href="/nastaveni" className="btn primary">Zapnout v Nastavení</Link>
        </div>
      </div>
    );
  }
  let days: Day[] = [];
  let credit = 0;
  let canteen = "";
  let anon = false;
  let problem = "";
  try {
    const r = await stravaMenu(ME);
    days = r.days;
    credit = r.credit;
    canteen = r.session.canteenName;
    anon = r.anon;
  } catch (e) {
    problem = e instanceof StravaError ? e.message : "Jídelníček se nepodařilo načíst.";
  }
  const today = pragueNow().date;
  const upcoming = days.filter((d) => d.date >= today && (d.meals.length || d.closed)).slice(0, 21);
  return (
    <div className="wide">
      <Head title="Obědy" sub={canteen || "Jídelníček a objednávky ze Strava.cz"} />
      <Flash sp={sp} />
      {problem && <p className="msg-error" role="alert">{problem}</p>}
      {!problem && (
        <>
          {!anon && (
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
                          {!anon && !m.soup && ((m.ordered && m.canCancel) || (!m.ordered && m.canOrder)) && (
                            <form action={orderAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="want" value={m.ordered ? "0" : "1"} />
                              <input type="hidden" name="name" value={m.name} />
                              <button className={`btn small${m.ordered ? "" : " primary"}`}>{m.ordered ? "Zrušit" : "Objednat"}</button>
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
          <p className="hint" style={{ marginTop: 18 }}>{anon ? "Jídelníček bez přihlášení: kredit a objednávky uvidíš po přihlášení ke Strava.cz v Nastavení. " : "Jídelny si objednávky předávají s prodlevou. "}Propojení spravuješ v <Link href="/nastaveni" className="link-u">Nastavení</Link>.</p>
        </>
      )}
    </div>
  );
}
