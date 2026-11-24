/** Rozdělení známek (kolik jedniček, dvojek…). Prosté HTML a CSS, žádný klient. Barvy odpovídají známkám v seznamu. */
export const GRADES = [1, 2, 3, 4, 5] as const;
/** Pořadí v legendě: známky 1 až 5 a nakonec „N“ (0 = známky bez číselné hodnoty: N, body, + a podobné). */
const KINDS = [1, 2, 3, 4, 5, 0] as const;
const at = (g: number) => (g === 0 ? 5 : g - 1);
const label = (g: number) => (g === 0 ? "N" : String(g));

/** Pět počtů pro známky 1 až 5 a šestý pro známky bez číselné hodnoty (N a podobné), které se neskrývají, jen se nepočítají do průměru. */
export const gradeCounts = (values: (number | null | undefined)[]) => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const v of values) {
    if (v != null && Number.isFinite(v)) counts[Math.min(5, Math.max(1, Math.round(v + 0.01))) - 1]++;
    else counts[5]++;
  }
  return counts;
};

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

const R = 80;
const pt = (a: number, r = R) => [100 + r * Math.sin(a), 100 - r * Math.cos(a)] as const;

/** Výseč koláče od úhlu a0 do a1 (v radiánech od 12. hodiny po směru hodin). */
const wedge = (a0: number, a1: number) => {
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
};

/** Koláčový graf rozdělení známek s legendou (počty a procenta). Prosté SVG a CSS, žádný klient. */
export function GradeDistribution({ counts, title = "Rozdělení známek", toggle, third }: { counts: number[]; title?: string; /** o ostatních (třetí osoba) */ third?: boolean; /** přepínač zobrazení N (jen když nějaké N existují) */ toggle?: React.ReactNode }) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total && !toggle) return null;
  if (!total) return <section className="gd card"><div className="gd-head"><h2 className="section">{title}</h2>{toggle}</div></section>;
  const graded = counts.slice(0, 5);
  const max = Math.max(...graded);
  const top = graded.indexOf(max) + 1;
  const ties = graded.filter((c) => c === max).length > 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const used = KINDS.filter((g) => counts[at(g)] > 0);
  let angle = 0;
  const slices = used.map((g) => {
    const a0 = angle;
    angle += (counts[at(g)] / total) * Math.PI * 2;
    return { g, a0, a1: angle };
  });
  return (
    <section className="gd card">
      <div className="gd-head">
        <h2 className="section">{title}</h2>
        {toggle}
        {max > 0 && <span className="gd-note">{ties ? "Nejčastější známky jsou vyrovnané" : <>Nejčastěji {third ? "mají" : "máš"} <b className={`gd-top g${top}`}>{top}</b> ({max}× · {pct(max)} %)</>}</span>}
      </div>
      <div className="gd-body">
        <svg className="gd-pie" viewBox="0 0 200 200" role="img" aria-label={`Rozdělení známek: ${KINDS.filter((g) => counts[at(g)]).map((g) => `${counts[at(g)]}× ${label(g)}`).join(", ")}`}>
          {slices.length === 1 ? (
            <circle cx="100" cy="100" r={R} className={`gd-s g${slices[0].g}`}><title>{`${counts[at(slices[0].g)]}× ${label(slices[0].g)} · 100 %`}</title></circle>
          ) : (
            slices.map((s) => (
              <path key={s.g} d={wedge(s.a0, s.a1)} className={`gd-s g${s.g}`}><title>{`${counts[at(s.g)]}× ${label(s.g)} · ${pct(counts[at(s.g)])} %`}</title></path>
            ))
          )}
          <circle cx="100" cy="100" r="42" className="gd-hole" />
          <text x="100" y="104" textAnchor="middle" className="gd-total">{total}</text>
          <text x="100" y="122" textAnchor="middle" className="gd-total-sub">{plural(total, "známka", "známky", "známek")}</text>
        </svg>
        <ul className="gd-legend">
          {KINDS.filter((g) => g !== 0 || counts[5] > 0).map((g) => (
            <li key={g} data-g={g} className={counts[at(g)] ? "" : "zero"} title={g === 0 ? "Známky bez číselné hodnoty (N, body a podobné)" : undefined}>
              <b className={`gd-chip g${g}`}>{label(g)}</b>
              <span className="gd-count">{counts[at(g)]}×</span>
              <span className="gd-pct">{pct(counts[at(g)])} %</span>
              <span className="gd-track"><i className={`g${g}`} style={{ width: `${pct(counts[at(g)])}%` }} /></span>
            </li>
          ))}
        </ul>
      </div>
      <p className="hint gd-foot">Známky bez číselné hodnoty (N a podobné) se do průměru nepočítají.</p>
    </section>
  );
}

/** Úzký pruh rozdělení u předmětu: jeden pruh, pět barevných dílů. */
export function GradeStrip({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <span className="gd-strip" role="img" aria-label={KINDS.filter((g) => counts[at(g)]).map((g) => `${counts[at(g)]}× ${label(g)}`).join(", ")} title={KINDS.filter((g) => counts[at(g)]).map((g) => `${counts[at(g)]}× ${label(g)}`).join(" · ")}>
      {KINDS.map((g) => (counts[at(g)] ? <i key={g} className={`g${g}`} style={{ flexGrow: counts[at(g)] }} /> : null))}
    </span>
  );
}
