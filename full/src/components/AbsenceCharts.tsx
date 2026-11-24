"use client";

import { useState } from "react";

/** missed = neomluvené, excused = omluvené, unsolved = nevyřízené (celkem je součet) */
type Day = { date: string; missed: number; excused: number; unsolved: number };
const MONTHS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
const WEEK = ["Po", "Út", "St", "Čt", "Pá"];
const W = 520;
const H = 210;
const PAD = { l: 30, r: 10, t: 12, b: 28 };
const dow = (iso: string) => ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7);
const hours = (n: number) => `${n} ${n === 1 ? "hodina" : n >= 2 && n <= 4 ? "hodiny" : "hodin"}`;

/** Měřítko osy y s hezkými čísly (nejvýš ~4 čárky). */
function scale(max: number) {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 20;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function Frame({ ticks, top, children, tip, label }: { ticks: number[]; top: number; children: React.ReactNode; tip: Tip; label: string }) {
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  return (
    <div className="chart-wrap ab-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 8} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {children}
      </svg>
      {tip && (
        <div className={`chart-tip${tip.y < 75 ? " below" : ""}`} style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / H) * 100}%` }}>
          <b>{tip.title}</b>
          {tip.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

/** Grafy absence: po měsících (omluveno / nevyřízeno / ostatní), podle dne v týdnu a narůstající součet. */
export function AbsenceCharts({ days }: { days: Day[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const hoursOf = (d: Day) => d.missed + d.excused + d.unsolved;
  const missedDays = days.filter((d) => hoursOf(d) > 0);
  if (!missedDays.length) return null;

  // po měsících (od prvního do posledního, prázdné měsíce zůstanou)
  const byMonth = new Map<string, { excused: number; unsolved: number; other: number }>();
  for (const d of missedDays) {
    const k = d.date.slice(0, 7);
    const m = byMonth.get(k) ?? { excused: 0, unsolved: 0, other: 0 };
    m.excused += d.excused;
    m.unsolved += d.unsolved;
    m.other += d.missed;
    byMonth.set(k, m);
  }
  const keys = [...byMonth.keys()].sort();
  const months: { key: string; excused: number; unsolved: number; other: number }[] = [];
  for (let [y, m] = keys[0].split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= keys[keys.length - 1]; m === 12 ? ((m = 1), y++) : m++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push({ key, ...(byMonth.get(key) ?? { excused: 0, unsolved: 0, other: 0 }) });
  }
  const mTotals = months.map((m) => m.excused + m.unsolved + m.other);
  const mScale = scale(Math.max(...mTotals));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const yOf = (v: number, top: number) => PAD.t + (1 - v / top) * plotH;
  const slot = plotW / months.length;
  const bw = Math.min(46, slot * 0.64);

  // podle dne v týdnu
  const wd = [0, 0, 0, 0, 0];
  for (const d of missedDays) if (dow(d.date) < 5) wd[dow(d.date)] += hoursOf(d);
  const wScale = scale(Math.max(...wd));
  const wslot = plotW / 5;
  const wbw = Math.min(54, wslot * 0.6);

  // narůstající součet
  const sorted = [...missedDays].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  const pts = sorted.map((d) => ({ date: d.date, total: (run += hoursOf(d)), added: hoursOf(d) }));
  const t0 = Date.parse(pts[0].date);
  const t1 = Date.parse(pts[pts.length - 1].date);
  const cScale = scale(run);
  const cx = (iso: string) => PAD.l + (t1 === t0 ? plotW / 2 : ((Date.parse(iso) - t0) / (t1 - t0)) * plotW);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${cx(p.date).toFixed(1)},${yOf(p.total, cScale.top).toFixed(1)}`).join(" ");
  const fmt = (iso: string) => `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`;

  return (
    <div className="auto-cols ab-charts span-all" onMouseLeave={() => setTip(null)}>
      <section>
        <h2 className="group-title">Po měsících</h2>
        <div className="card card-pad">
          <Frame ticks={mScale.ticks} top={mScale.top} tip={tip?.title.startsWith("M:") ? { ...tip, title: tip.title.slice(2) } : null} label="Zameškané hodiny po měsících">
            {months.map((m, i) => {
              const x = PAD.l + slot * i + (slot - bw) / 2;
              let acc = 0;
              const seg = (v: number, cls: string) => {
                if (!v) return null;
                const y1 = yOf(acc + v, mScale.top);
                const h = yOf(acc, mScale.top) - y1;
                acc += v;
                return <rect key={cls} x={x} y={y1} width={bw} height={Math.max(h, 1)} rx="3" className={`ab-bar ${cls}`} />;
              };
              const total = mTotals[i];
              return (
                <g
                  key={m.key}
                  tabIndex={0}
                  aria-label={`${MONTHS[Number(m.key.slice(5)) - 1]}: ${hours(total)}`}
                  onMouseEnter={() => setTip({ x: x + bw / 2, y: yOf(total, mScale.top), title: `M:${MONTHS[Number(m.key.slice(5)) - 1]} ${m.key.slice(0, 4)}`, lines: [hours(total), ...(m.excused ? [`omluveno ${m.excused}`] : []), ...(m.unsolved ? [`nevyřízeno ${m.unsolved}`] : []), ...(m.other ? [`neomluveno ${m.other}`] : [])] })}
                  onFocus={() => setTip({ x: x + bw / 2, y: yOf(total, mScale.top), title: `M:${MONTHS[Number(m.key.slice(5)) - 1]} ${m.key.slice(0, 4)}`, lines: [hours(total)] })}
                  onBlur={() => setTip(null)}
                >
                  <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                  {seg(m.excused, "ok")}
                  {seg(m.unsolved, "warn")}
                  {seg(m.other, "bad")}
                  <text x={x + bw / 2} y={H - 8} className="axis" textAnchor="middle">{MONTHS[Number(m.key.slice(5)) - 1]}</text>
                </g>
              );
            })}
          </Frame>
          <div className="chart-legend">
            <span><i className="lg ab-key ok" />omluveno</span>
            <span><i className="lg ab-key warn" />nevyřízeno</span>
            <span><i className="lg ab-key bad" />neomluveno</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="group-title">Podle dne v týdnu</h2>
        <div className="card card-pad">
          <Frame ticks={wScale.ticks} top={wScale.top} tip={tip?.title.startsWith("W:") ? { ...tip, title: tip.title.slice(2) } : null} label="Zameškané hodiny podle dne v týdnu">
            {wd.map((v, i) => {
              const x = PAD.l + wslot * i + (wslot - wbw) / 2;
              const y1 = yOf(v, wScale.top);
              return (
                <g
                  key={i}
                  tabIndex={0}
                  aria-label={`${WEEK[i]}: ${hours(v)}`}
                  onMouseEnter={() => setTip({ x: x + wbw / 2, y: y1, title: `W:${WEEK[i]}`, lines: [hours(v)] })}
                  onFocus={() => setTip({ x: x + wbw / 2, y: y1, title: `W:${WEEK[i]}`, lines: [hours(v)] })}
                  onBlur={() => setTip(null)}
                >
                  <rect x={PAD.l + wslot * i} y={PAD.t} width={wslot} height={plotH} fill="transparent" />
                  {v > 0 && <rect x={x} y={y1} width={wbw} height={yOf(0, wScale.top) - y1} rx="3" className={`ab-bar ${v === Math.max(...wd) ? "bad" : "ok"}`} />}
                  <text x={x + wbw / 2} y={H - 8} className="axis" textAnchor="middle">{WEEK[i]}</text>
                </g>
              );
            })}
          </Frame>
          <p className="hint" style={{ margin: "10px 0 0" }}>Nejvíc hodin chybíš v {["pondělí", "úterý", "středu", "čtvrtek", "pátek"][wd.indexOf(Math.max(...wd))]}.</p>
        </div>
      </section>

      <section>
        <h2 className="group-title">Narůstající součet</h2>
        <div className="card card-pad">
          <Frame ticks={cScale.ticks} top={cScale.top} tip={tip?.title.startsWith("C:") ? { ...tip, title: tip.title.slice(2) } : null} label="Narůstající počet zameškaných hodin">
            <text x={PAD.l} y={H - 8} className="axis">{fmt(pts[0].date)}</text>
            <text x={W - PAD.r} y={H - 8} className="axis" textAnchor="end">{fmt(pts[pts.length - 1].date)}</text>
            <path d={path} className="ab-line" />
            {pts.map((p) => (
              <circle
                key={p.date}
                cx={cx(p.date)}
                cy={yOf(p.total, cScale.top)}
                r="5"
                className="ab-dot"
                tabIndex={0}
                aria-label={`${fmt(p.date)}: celkem ${hours(p.total)}`}
                onMouseEnter={() => setTip({ x: cx(p.date), y: yOf(p.total, cScale.top), title: `C:${fmt(p.date)}`, lines: [`celkem ${hours(p.total)}`, `ten den +${p.added}`] })}
                onFocus={() => setTip({ x: cx(p.date), y: yOf(p.total, cScale.top), title: `C:${fmt(p.date)}`, lines: [`celkem ${hours(p.total)}`] })}
                onBlur={() => setTip(null)}
              />
            ))}
          </Frame>
        </div>
      </section>
    </div>
  );
}
