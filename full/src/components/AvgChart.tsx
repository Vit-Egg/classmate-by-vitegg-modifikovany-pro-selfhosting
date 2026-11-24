"use client";

import { useEffect, useRef, useState } from "react";

const PAD = { l: 38, r: 14, t: 12, b: 26 };
const cs = (n: number) => n.toFixed(2).replace(".", ",");
const fmt = (iso: string) => `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`;

type Pt = { d: string; v: number };

/** Interaktivní graf vývoje celkového průměru: tvůj a třídy v jednom. Najetí nebo dotyk ukáže hodnoty ke dni, tlačítka v legendě čáry skrývají. */
export function AvgChart({ dates, mine, cls, classEmpty }: { dates: string[]; mine: (number | null)[]; cls: (number | null)[]; classEmpty: string }) {
  const [hidden, setHidden] = useState<{ me: boolean; cls: boolean }>({ me: false, cls: false });
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(680); // šířka grafu v pixelech, ať se text nezmenšuje a výška zůstává nízká
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = Math.round(Math.min(190, Math.max(140, W * 0.2)));
  const pick = (vals: (number | null)[]): Pt[] => dates.map((d, i) => ({ d, v: vals[i] as number })).filter((p) => vals[dates.indexOf(p.d)] != null);
  const me = pick(mine);
  const cl = pick(cls);
  const hasCls = cl.length >= 2;
  const shown = [...(hidden.me ? [] : me), ...(hidden.cls || !hasCls ? [] : cl)];
  if (me.length < 2) return <section className="card avgc"><h2 className="section">Vývoj průměru</h2><p className="hint" style={{ margin: "8px 0 0" }}>Na graf je zatím málo známek.</p></section>;
  const base = shown.length ? shown : me;
  let lo = Math.max(1, Math.min(...base.map((p) => p.v)) - 0.25);
  let hi = Math.min(5, Math.max(...base.map((p) => p.v)) + 0.25);
  if (hi - lo < 0.5) { lo = Math.max(1, lo - 0.25); hi = Math.min(5, hi + 0.25); }
  // osa začíná u první skutečné hodnoty zobrazených čar (ne u prvního data, ke kterému ještě žádná čára nemá bod)
  const ds = base.map((p) => p.d).sort();
  const d0 = ds[0];
  const d1 = ds[ds.length - 1];
  const t0 = Date.parse(d0);
  const t1 = Date.parse(d1);
  const x = (d: string) => PAD.l + (t1 === t0 ? 0.5 : (Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const line = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const hd = hover != null ? dates[hover] : null;
  const hm = hover != null ? mine[hover] : null;
  const hc = hover != null ? cls[hover] : null;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = -1;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] < d0 || dates[i] > d1) continue;
      if (best < 0 || Math.abs(x(dates[i]) - px) < Math.abs(x(dates[best]) - px)) best = i;
    }
    setHover(best < 0 ? null : best);
  };
  const lastMe = me[me.length - 1];
  const lastCl = hasCls ? cl[cl.length - 1] : null;
  return (
    <section className="card avgc">
      <div className="avgc-head">
        <h2 className="section">Vývoj průměru</h2>
        <div className="avgc-legend">
          <button type="button" className={`avgc-key me${hidden.me ? " off" : ""}`} aria-pressed={!hidden.me} onClick={() => setHidden((h) => ({ ...h, me: !h.me }))}><i /> Já <b>{cs(lastMe.v)}</b></button>
          <button type="button" className={`avgc-key class${hidden.cls ? " off" : ""}`} aria-pressed={!hidden.cls} disabled={!hasCls} onClick={() => setHidden((h) => ({ ...h, cls: !h.cls }))}><i /> Třída {lastCl && <b>{cs(lastCl.v)}</b>}</button>
        </div>
      </div>
      <p className="hint" style={{ margin: "0 0 6px" }}>Celkový průměr po každé známce, nahoře je lepší. Třída = anonymně sdílející spolužáci.{!hasCls && ` ${classEmpty}`}</p>
      <div className="avgc-wrap" ref={box} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Vývoj průměru: tvůj od ${cs(me[0].v)} do ${cs(lastMe.v)}${lastCl ? `, třídy do ${cs(lastCl.v)}` : ""}`} onPointerMove={move} onPointerDown={move}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.l - 8} y={y(t) + 4} className="axis" textAnchor="end">{cs(t).replace(/0$/, "")}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 8} className="axis">{fmt(d0)}</text>
          <text x={W - PAD.r} y={H - 8} className="axis" textAnchor="end">{fmt(d1)}</text>
          {hd && <line x1={x(hd)} x2={x(hd)} y1={PAD.t} y2={H - PAD.b} className="avgc-cross" />}
          {hasCls && !hidden.cls && <path d={line(cl)} className="avgc-line class" />}
          {!hidden.me && <path d={line(me)} className="avgc-line me" />}
          {hd && hc != null && !hidden.cls && <circle cx={x(hd)} cy={y(hc)} r="5" className="avgc-dot class" />}
          {hd && hm != null && !hidden.me && <circle cx={x(hd)} cy={y(hm)} r="5" className="avgc-dot me" />}
        </svg>
        {hd && (hm != null || hc != null) && (
          <div className="avgc-tip" style={{ left: `${Math.min(78, Math.max(22, (x(hd) / W) * 100))}%` }}>
            <b>{fmt(hd)}</b>
            {hm != null && !hidden.me && <span><i className="me" /> Já {cs(hm)}</span>}
            {hc != null && !hidden.cls && <span><i className="class" /> Třída {cs(hc)}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
