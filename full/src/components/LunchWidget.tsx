import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sk } from "@/components/Skeleton";
import { dayName, dowOf, fmtShort, relativeDay } from "@/lib/dates";
import { StravaError, isLunch, stravaMenu, type Day } from "@/lib/strava";

const kc = (n: number) => `${n.toFixed(2).replace(".", ",").replace(",00", "")} Kč`;

export function LunchSkeleton() {
  return (
    <section aria-hidden>
      <div className="section-head"><h2 className="section">Oběd</h2></div>
      <div className="card card-pad" style={{ display: "grid", gap: 10 }}><Sk w="40%" h={14} /><Sk w="85%" h={16} /><Sk w="70%" h={16} /></div>
    </section>
  );
}

/**
 * Oběd na Dnes: dnešní polévka a obědy (po 14. hodině a o víkendu nejbližší následující den s jídelníčkem).
 * Načítá se zvlášť (Suspense), ať Strava.cz nezdržuje zbytek stránky. Chyba jen schová obsah, Dnes zůstane celé.
 */
export async function LunchWidget({ userId, today, hour }: { userId: number; today: string; hour: number }) {
  let days: Day[] = [];
  let problem = "";
  let anon = false;
  try {
    const r = await stravaMenu(userId);
    days = r.days;
    anon = r.anon;
  } catch (e) {
    problem = e instanceof StravaError && e.kind === "auth" ? e.message : "Jídelníček se teď nepodařilo načíst.";
  }
  // Od 14. hodiny už dnešní oběd nedává smysl, ukáže se další den, kdy se vaří
  const day = days.find((d) => !d.closed && d.meals.some(isLunch) && (hour < 14 ? d.date >= today : d.date > today)) ?? null;
  const closedToday = days.find((d) => d.date === today)?.closed;
  const meals = day ? day.meals.filter(isLunch) : [];
  const title = day ? (day.date === today ? "Dnes" : `${dayName(dowOf(day.date))} ${fmtShort(day.date)} (${relativeDay(day.date, today)})`) : "";

  return (
    <section>
      <div className="section-head">
        <h2 className="section">Oběd</h2>
        <Link href="/obedy" className="link-all">Jídelníček →</Link>
      </div>
      {problem ? (
        <div className="empty">{problem}</div>
      ) : meals.length ? (
        <div className="card lunch-card">
          <div className="lunch-top"><span className="chip plain">{title}</span>{!anon && meals.some((m) => m.ordered) && <span className="chip">objednáno</span>}</div>
          <ul className="lunch-list">
            {meals.map((m) => (
              <li key={`${m.id}-${m.name}`} className={`${m.soup ? "soup" : ""}${m.ordered ? " ordered" : ""}`}>
                <span className="lunch-kind">{m.soup ? "Polévka" : m.label}</span>
                <span className="lunch-name">{m.name}{m.ordered && <Icon name="tick" size={14} />}</span>
                {m.price > 0 && !m.soup && <span className="lunch-price">{kc(m.price)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="empty">{closedToday ? "Jídelna dnes nevaří." : "Jídelníček zatím nic nenabízí."}</div>
      )}
    </section>
  );
}
