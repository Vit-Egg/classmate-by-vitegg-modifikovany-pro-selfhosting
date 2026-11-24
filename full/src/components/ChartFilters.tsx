"use client";

import { useMemo, useState } from "react";
import { AvgChart } from "./AvgChart";
import { GradeDistribution, gradeCounts } from "./GradeDistribution";

export type ChartMark = { s: string; d: string; v: number | null; w: number; numeric: boolean };
type History = { dates: string[]; mine: (number | null)[]; cls: (number | null)[]; counts: number[] } | null;

const PERIODS = [
  { id: "all", label: "Vše" },
  { id: "30", label: "30 dní" },
  { id: "90", label: "90 dní" },
  { id: "year", label: "Školní rok" },
] as const;
type Period = (typeof PERIODS)[number]["id"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** První den období, od kterého se grafy ukazují (školní rok začíná 1. září). */
function since(p: Period): string | null {
  const now = new Date();
  if (p === "all") return null;
  if (p === "year") return iso(new Date(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1, 8, 1));
  return iso(new Date(now.getTime() - Number(p) * 86_400_000));
}

/** Celkový průměr (průměr vážených průměrů předmětů, každý předmět stejně) ze známek k danému dni včetně; stejný výpočet jako na serveru. */
function overallUpTo(marks: ChartMark[], date: string): number | null {
  const subjects = new Map<string, { sum: number; w: number }>();
  for (const m of marks) {
    if (m.v == null || m.d > date) continue;
    const e = subjects.get(m.s) ?? { sum: 0, w: 0 };
    e.sum += m.v * m.w;
    e.w += m.w;
    subjects.set(m.s, e);
  }
  const per = [...subjects.values()].filter((e) => e.w > 0).map((e) => e.sum / e.w);
  return per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
}

/** Grafy ve Známkách s filtry: předmět a období. Můj průměr a moje známky se přepočítají podle filtru; průměr a známky třídy jsou jen souhrnné, takže se při filtru předmětu schovají a při filtru období se jen ořízne osa. */
export function ChartFilters({ marks, history, subjects, classEmpty, classPie }: { marks: ChartMark[]; history: History; subjects: string[]; classEmpty: string; classPie: boolean }) {
  const [subject, setSubject] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const from = since(period);
  const filtered = useMemo(() => marks.filter((m) => (!subject || m.s === subject) && (!from || m.d >= from)), [marks, subject, from]);

  const chart = useMemo(() => {
    if (!history) return null;
    const idx = history.dates.map((d, i) => i).filter((i) => !from || history.dates[i] >= from);
    const dates = idx.map((i) => history.dates[i]);
    const pool = subject ? marks.filter((m) => m.s === subject) : marks;
    const mine = subject ? dates.map((d) => overallUpTo(pool, d)) : idx.map((i) => history.mine[i]);
    const cls = subject ? dates.map(() => null) : idx.map((i) => history.cls[i]);
    return { dates, mine, cls };
  }, [history, marks, subject, from]);

  const active = !!subject || period !== "all";
  const counts = gradeCounts(filtered.filter((m) => m.numeric).map((m) => m.v));
  return (
    <>
      <div className="chart-filters" role="group" aria-label="Filtry grafů">
        <label className="cfl">
          <span>Předmět</span>
          <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Všechny předměty</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="cfl">
          <span>Období</span>
          <div className="seg wrap" role="group" aria-label="Období">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        {active && <button type="button" className="btn small" onClick={() => { setSubject(""); setPeriod("all"); }}>Zrušit filtry</button>}
      </div>
      <div className="charts-row">
        {chart && <AvgChart dates={chart.dates} mine={chart.mine} cls={chart.cls} classEmpty={subject ? "Průměr třídy je jen za všechny předměty dohromady, při filtru předmětu se neukazuje." : classEmpty} />}
        <GradeDistribution counts={counts} title={subject ? `Moje známky: ${subject}` : "Moje známky"} />
        {history && classPie && !subject && history.counts.slice(0, 5).some((c) => c > 0) && <GradeDistribution counts={history.counts} title="Známky ve třídě" third />}
      </div>
      {filtered.length === 0 && <p className="hint" style={{ margin: "10px 4px 0" }}>V téhle kombinaci filtrů nejsou žádné známky.</p>}
      {active && classPie && <p className="hint" style={{ margin: "8px 4px 0" }}>Graf třídy a její čára v grafu průměru jsou souhrnné za všechny předměty, proto se podle předmětu nefiltrují (podle období se jen ořízne osa).</p>}
    </>
  );
}
