import Link from "next/link";
import { orderAction } from "../../actions";
import { ME } from "@/lib/db";
import { pragueNow } from "@/lib/dates";
import { fmtDay } from "@/lib/embed/core";
import { StravaError, stravaAccount, stravaMenu } from "@/lib/strava";
import { Flash, type SP } from "../ui";

export const metadata = { title: "Obědy" };

export default async function LunchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const acc = stravaAccount(ME);
  const today = pragueNow().date;
  let menu: Awaited<ReturnType<typeof stravaMenu>> | null = null;
  let error = "";
  if (acc) {
    try {
      menu = await stravaMenu(ME);
    } catch (e) {
      error = e instanceof StravaError ? e.message : "Strava.cz teď neodpovídá.";
    }
  }
  const days = (menu?.days ?? []).filter((d) => d.date >= today).slice(0, 10);
  return (
    <>
      <div className="head">
        <div>
          <h1>Obědy</h1>
          <p className="sub">
            Strava.cz{menu?.session.canteenName ? ` · ${menu.session.canteenName}` : ""}
            {menu && !menu.anon ? ` · kredit ${menu.credit.toLocaleString("cs-CZ")} Kč` : ""}
          </p>
        </div>
      </div>
      <Flash sp={sp} />
      {!acc ? (
        <div className="card">
          Strava.cz není propojená. <Link href="/nastaveni">Propojit v Nastavení</Link>
        </div>
      ) : error ? (
        <div className="msg e">{error}</div>
      ) : !days.length ? (
        <div className="card">Na příští dny není jídelníček.</div>
      ) : (
        <div className="stack">
          {days.map((d) => (
            <div key={d.date} className="card">
              <b>{fmtDay(d.date, today)}</b>
              {d.closed ? (
                <p className="mut" style={{ margin: "6px 0 0" }}>Jídelna nevaří.</p>
              ) : (
                <table style={{ marginTop: 6 }}>
                  <tbody>
                    {d.meals.map((m) => (
                      <tr key={m.id}>
                        <td style={{ width: 110 }}><span className="chip">{m.soup ? "Polévka" : m.label}</span></td>
                        <td>
                          {m.ordered ? <b>{m.name}</b> : m.name}
                          {m.allergens.length > 0 && <div className="hint">alergeny {m.allergens.join(", ")}</div>}
                        </td>
                        <td style={{ width: 140, textAlign: "right" }}>
                          {menu!.anon || m.soup ? null : m.ordered ? (
                            m.canCancel ? (
                              <form action={orderAction}>
                                <input type="hidden" name="id" value={m.id} />
                                <input type="hidden" name="want" value="0" />
                                <input type="hidden" name="name" value={m.name} />
                                <button className="btn small">Zrušit</button>
                              </form>
                            ) : (
                              <span className="ok">objednáno</span>
                            )
                          ) : m.canOrder ? (
                            <form action={orderAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="want" value="1" />
                              <input type="hidden" name="name" value={m.name} />
                              <button className="btn small primary">Objednat</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
