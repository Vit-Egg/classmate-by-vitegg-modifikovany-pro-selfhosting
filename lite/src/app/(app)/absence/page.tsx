import { absence } from "@/lib/bk";
import { absenceHours } from "@/lib/types";
import { Flash, SyncButton, type SP } from "../ui";

export const metadata = { title: "Absence" };

const d = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export default async function AbsencePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const a = await absence();
  const days = (a?.days ?? []).filter((x) => absenceHours(x) + x.late + x.soon > 0).sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      <div className="head">
        <div>
          <h1>Absence</h1>
          <p className="sub">{a ? `Hranice pro neklasifikaci: ${Math.round(a.threshold * 100)} % hodin předmětu` : "Absence z Bakalářů"}</p>
        </div>
        <SyncButton back="/absence" />
      </div>
      <Flash sp={sp} />
      {!a ? (
        <div className="card">Absence zatím není načtená.</div>
      ) : (
        <>
          <div className="card">
            <table>
              <thead>
                <tr><th>Předmět</th><th>Zameškáno</th><th>Hodin celkem</th><th>Podíl</th></tr>
              </thead>
              <tbody>
                {a.subjects.filter((s) => s.lessons > 0).map((s) => {
                  const p = s.missed / s.lessons;
                  return (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.missed}</td>
                      <td>{s.lessons}</td>
                      <td className={p >= a.threshold ? "bad" : p >= a.threshold * 0.75 ? "c" : undefined}>{Math.round(p * 100)} %</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2>Po dnech</h2>
          <div className="card">
            {days.length ? (
              <table>
                <thead>
                  <tr><th>Den</th><th>Omluveno</th><th>Nevyřízeno</th><th>Neomluveno</th><th>Pozdě</th></tr>
                </thead>
                <tbody>
                  {days.map((x) => (
                    <tr key={x.date}><td>{d(x.date)}</td><td>{x.excused || ""}</td><td>{x.unsolved || ""}</td><td className={x.missed ? "bad" : undefined}>{x.missed || ""}</td><td>{x.late || ""}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="mut">Žádná absence.</span>
            )}
          </div>
        </>
      )}
    </>
  );
}
