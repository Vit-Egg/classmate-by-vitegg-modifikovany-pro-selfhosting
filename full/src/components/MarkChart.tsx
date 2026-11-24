"use client";

import { useRef, useState } from "react";

export type ChartMark = { id: string; date: string; value: number; text: string; caption: string; weight: number; avg?: number; n?: number };

const W = 680;
const H = 300;
const PAD = { l: 34, r: 18, t: 16, b: 34 };
const gradeColor = (v: number) => ["", "#2fbf82", "#8fcf3a", "#e8c23a", "#ee8a3a", "#e85a4a"][Math.min(5, Math.max(1, Math.round(v + 0.01)))];
const cs = (n: number) => n.toFixed(2).replace(".", ",");
const fmt = (iso: string) => `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`;

/** Malý náhled (klikatelný) + dialog s velkým grafem vývoje známek. */
export function MarkChartButton({ subject, marks, hue }: { subject: string; marks: ChartMark[]; hue: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const pts = [...marks].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (pts.length < 2) return null;

  const t0 = Date.parse(pts[0].date);
  const t1 = Date.parse(pts[pts.length - 1].date);
  const x = (d: string) => PAD.l + (t1 === t0 ? 0.5 : (Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((v - 1) / 4) * (H - PAD.t - PAD.b);

  let sum = 0;
  let w = 0;
  const running = pts.map((p) => {
    sum += p.value * p.weight;
    w += p.weight;
    return sum / w;
  });
  const avgPath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(running[i]).toFixed(1)}`).join(" ");
  const h = hover != null ? pts[hover] : null;

  // miniatura
  const sw = 64;
  const sh = 22;
  const mini = pts.map((p, i) => `${((i / (pts.length - 1)) * (sw - 6) + 3).toFixed(1)},${(((p.value - 1) / 4) * (sh - 6) + 3).toFixed(1)}`);
  const last = mini[mini.length - 1].split(",");

  return (
    <>
      <button type="button" className="spark-btn" title="Zvětšit graf" aria-label={`Zvětšit graf známek z ${subject}`} onClick={() => { setOpen(true); dlg.current?.showModal(); }} style={{ ["--hue" as string]: `var(--h-${hue})` }}>
        <svg className="spark" width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`} aria-hidden>
          <polyline points={mini.join(" ")} pathLength={1} />
          <circle cx={last[0]} cy={last[1]} r="2.6" />
        </svg>
      </button>
      <dialog ref={dlg} className="modal" onClose={() => { setOpen(false); setHover(null); }} onClick={(e) => e.target === dlg.current && dlg.current.close()}>
        {open && (
          <div className="modal-card chart-card">
            <h2>{subject}</h2>
            <p className="hint" style={{ margin: "-10px 0 14px" }}>Vývoj známek v čase. Nahoře je jednička.</p>
            <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graf známek z ${subject}`}>
                {[1, 2, 3, 4, 5].map((g) => (
                  <g key={g}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="grid" />
                    <text x={PAD.l - 10} y={y(g) + 4} className="axis" textAnchor="end">{g}</text>
                  </g>
                ))}
                <text x={PAD.l} y={H - 8} className="axis">{fmt(pts[0].date)}</text>
                <text x={W - PAD.r} y={H - 8} className="axis" textAnchor="end">{fmt(pts[pts.length - 1].date)}</text>
                <path d={avgPath} className="avg-line" />
                {pts.map((p) =>
                  p.avg != null ? <rect key={`a${p.id}`} x={x(p.date) - 5} y={y(p.avg) - 5} width="10" height="10" transform={`rotate(45 ${x(p.date)} ${y(p.avg)})`} className="other" /> : null,
                )}
                {pts.map((p, i) => (
                  <circle key={p.id} cx={x(p.date)} cy={y(p.value)} r={hover === i ? 9 : 7} fill={gradeColor(p.value)} className="pt" tabIndex={0} aria-label={`${p.caption}, ${p.text}, ${fmt(p.date)}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                ))}
              </svg>
              {h && (
                <div className="chart-tip" style={{ left: `${(x(h.date) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%` }}>
                  <b>{h.caption}</b>
                  <span>{fmt(h.date)} · známka {h.text} · váha {h.weight}</span>
                  {h.avg != null && <span>Ø ostatních {cs(h.avg)} ({h.n} lidí)</span>}
                </div>
              )}
            </div>
            <div className="chart-legend">
              <span><i className="lg dot-lg" /> tvoje známky</span>
              <span><i className="lg line-lg" /> tvůj průměr v čase</span>
              {pts.some((p) => p.avg != null) && <span><i className="lg diamond-lg" /> průměr ostatních</span>}
              <span style={{ marginLeft: "auto" }}>Teď: <b>{cs(running[running.length - 1])}</b></span>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => dlg.current?.close()}>Zavřít</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
