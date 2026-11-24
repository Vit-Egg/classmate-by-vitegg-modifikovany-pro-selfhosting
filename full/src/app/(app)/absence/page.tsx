import { absenceHours } from "@/lib/types";
import { namedAbsence } from "@/lib/normalize";
import { SyncNotice } from "@/components/SyncNotice";
import { all } from "@/lib/db";
import { monthShort, dayShort, dowOf, fmtShort, plural } from "@/lib/dates";
import { AbsenceCharts } from "@/components/AbsenceCharts";
import { AbsenceLimit } from "@/components/AbsenceLimit";
import { getPref } from "@/lib/prefs";
import { requireUser } from "@/lib/session";
import { getAbsence } from "@/lib/sync";

export const metadata = { title: "Absence" };
export const dynamic = "force-dynamic";

const pct = (r: number) => `${(r * 100).toFixed(r * 100 < 10 && r > 0 ? 1 : 0).replace(".", ",")} %`;

export default async function AbsencePage() {
  const user = await requireUser();
  const result = await getAbsence(user);
  const own = Number(getPref(user, "abs_limit")) || 0; // vlastní hranice v % (0 = podle Bakalářů)
  // hodina bez předmětu (starší uložená data ji mají s prázdným názvem) se v přehledu neukazuje
  const fixed = result.data ? { ...result.data, subjects: namedAbsence(result.data.subjects) } : result.data;
  const data = fixed && own ? { ...fixed, threshold: own / 100 } : fixed;
  const hues = new Map(all<{ name: string; hue: string }>("SELECT name, hue FROM subjects WHERE class_id = ?", user.class_id).map((s) => [s.name, s.hue]));

  const total = data ? data.days.reduce((a, d) => ({ all: a.all + absenceHours(d), missed: a.missed + d.missed, excused: a.excused + d.excused, unsolved: a.unsolved + d.unsolved, late: a.late + d.late + d.soon }), { all: 0, missed: 0, excused: 0, unsolved: 0, late: 0 }) : null;
  const subjects = (data?.subjects ?? []).filter((s) => s.missed || s.late || s.soon || s.school).sort((a, b) => b.missed / (b.lessons || 1) - a.missed / (a.lessons || 1));

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Absence</h1>
          <p className="subtitle">Zameškané hodiny a pozdní příchody</p>
        </div>
        {result.data && <AbsenceLimit own={own} bakalari={Math.round(result.data.threshold * 100)} />}
      </div>
      <SyncNotice result={result} />
      {data && total && (
        <div className="auto-cols">
          <div className="stats auto span-all">
            <div className="card stat"><b>{total.all}</b><span>zameškaných {plural(total.all, "hodina", "hodiny", "hodin")}</span></div>
            <div className="card stat"><b>{total.excused}</b><span>omluveno</span></div>
            {total.missed > 0 && <div className="card stat alert"><b>{total.missed}</b><span>neomluveno</span></div>}
            <div className={`card stat${total.unsolved ? " alert" : ""}`}><b>{total.unsolved}</b><span>nevyřízeno</span></div>
            <div className="card stat"><b>{total.late}</b><span>pozdních příchodů a odchodů</span></div>
          </div>

          <AbsenceCharts days={data.days} />

          {subjects.length > 0 && (
            <section className="span-all">
              <h2 className="group-title">Podle předmětů</h2>
              <div className="card rows split">
                {subjects.map((s) => {
                  const ratio = s.lessons ? s.missed / s.lessons : 0;
                  const level = ratio >= data.threshold ? "danger" : ratio >= data.threshold * 0.75 ? "warn" : "ok";
                  return (
                    <div key={s.name} className="abs-row" style={{ ["--hue" as string]: `var(--h-${hues.get(s.name) ?? "gray"})` }}>
                      <div className="abs-head">
                        <span className="dot" />
                        <b>{s.name}</b>
                        <span className="abs-nums">{s.missed} z {s.lessons} {plural(s.lessons, "hodiny", "hodin", "hodin")} · <b className={level}>{pct(ratio)}</b></span>
                      </div>
                      <div className="abs-bar" role="img" aria-label={`${pct(ratio)} zameškáno, hranice ${pct(data.threshold)}`}>
                        <i className={level} style={{ width: `${Math.min(100, (ratio / (data.threshold * 1.2)) * 100)}%` }} />
                        <span className="abs-limit" style={{ left: `${(1 / 1.2) * 100}%` }} title={`Hranice ${pct(data.threshold)}`} />
                      </div>
                      {s.lessons > 0 && (() => {
                        const left = Math.ceil(data.threshold * s.lessons) - 1 - s.missed; // kolik hodin jde ještě zameškat, aby podíl zůstal pod hranicí
                        return <div className={`abs-left ${left < 0 ? "danger" : left <= 2 ? "warn" : ""}`}>{left < 0 ? `Hranici ${pct(data.threshold)} už máš překročenou.` : left === 0 ? "Další hodina už by hranici překročila." : `Ještě můžeš zameškat ${left} ${plural(left, "hodinu", "hodiny", "hodin")}, než dosáhneš hranice ${pct(data.threshold)}.`}</div>;
                      })()}
                      {(s.late > 0 || s.soon > 0) && (
                        <div className="item-meta">
                          {s.late > 0 && <span>{s.late}× pozdě</span>}
                          {s.soon > 0 && <span>{s.soon}× odchod</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="hint">Svislá čárka je hranice {pct(data.threshold)} zameškaných hodin{own ? " (nastavená tebou)" : ", od které hrozí neklasifikace"}.</p>
            </section>
          )}

          <section>
            <h2 className="group-title">Po dnech</h2>
            {data.days.length ? (
              <div className="card rows">
                {data.days.map((d) => (
                  <div key={d.date} className="item">
                    <div className="date-badge"><b>{Number(d.date.slice(8))}</b><span>{dayShort(dowOf(d.date))} · {monthShort(d.date)}</span></div>
                    <div className="item-main">
                      <div className="item-title">{absenceHours(d) > 0 ? `Absence · ${absenceHours(d)} ${plural(absenceHours(d), "hodina", "hodiny", "hodin")}` : "Absence"}</div>
                      <div className="item-meta">
                        <span>{fmtShort(d.date)} {d.date.slice(0, 4)}</span>
                        {d.excused > 0 && <span className="chip">omluveno {d.excused}</span>}
                        {d.unsolved > 0 && <span className="chip danger-chip">nevyřízeno {d.unsolved}</span>}
                        {d.late > 0 && <span className="chip plain">pozdě {d.late}</span>}
                        {d.soon > 0 && <span className="chip plain">odchod {d.soon}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Žádná absence. Tak to má být.</div>
            )}
            {data.days.length > 0 && <p className="hint">Důvod absence Bakaláři v tomto přehledu neposkytují, vidíš jen počty hodin a jestli jsou omluvené.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
