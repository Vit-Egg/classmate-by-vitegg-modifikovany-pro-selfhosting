"use client";

import { useEffect, useMemo, useState } from "react";

type M = { value: number; weight: number };
type Subj = { name: string; hue: string; marks: M[] };
const cs = (n: number) => n.toFixed(2).replace(".", ",");
const tile = (v: number) => `g${Math.min(5, Math.max(1, Math.round(v + 0.01)))}`;
const label = (v: number) => (Number.isInteger(v) ? String(v) : `${Math.floor(v)}−`);
const WORD: Record<number, [string, string, string]> = { 1: ["jednička", "jedničky", "jedniček"], 2: ["dvojka", "dvojky", "dvojek"], 3: ["trojka", "trojky", "trojek"], 4: ["čtyřka", "čtyřky", "čtyřek"] };
const TARGETS = [1.5, 2, 2.5, 3, 3.5];
const WEIGHTS = [1, 2, 3, 4, 5, 6, 8, 10];
/** Poloha na stupnici 1 až 5 v procentech (jednička vlevo). */
const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 1) / 4) * 100))}%`;

/** Předvídač průměru: vybereš předmět, přidáš si smyšlené známky a vidíš, jak by se změnil průměr, nebo co potřebuješ na vysněný průměr. Nic se neukládá. */
export function MarkPredictor({ subjects }: { subjects: Subj[] }) {
  const open = true;
  const [idx, setIdx] = useState(0);
  const [fake, setFake] = useState<M[]>([]);
  const [grade, setGrade] = useState(1);
  const [minus, setMinus] = useState(false);
  const [weight, setWeight] = useState(1);
  const [target, setTarget] = useState(2);
  const subj = subjects[idx] ?? subjects[0];

  const base = useMemo(() => (subj?.marks ?? []).reduce((a, m) => ({ s: a.s + m.value * m.weight, w: a.w + m.weight }), { s: 0, w: 0 }), [subj]);
  if (!subj) return null;
  const now = base.w ? base.s / base.w : null;
  const all = fake.reduce((a, m) => ({ s: a.s + m.value * m.weight, w: a.w + m.weight }), base);
  const next = all.w ? all.s / all.w : null;
  const value = grade + (minus && grade < 5 ? 0.5 : 0);
  const reached = next != null && next <= target + 1e-9;
  const needs = [1, 2, 3, 4].filter((g) => g < target).map((g) => ({ g, n: Math.ceil((all.s - target * all.w) / (weight * (target - g)) - 1e-9) })).filter((x) => x.n >= 1 && x.n <= 30);
  const diff = now != null && next != null ? next - now : 0;
  const trend = Math.abs(diff) < 1e-9 ? "" : diff < 0 ? "better" : "worse";

  const pick = (i: number) => {
    setIdx(i);
    setFake([]);
    const last = subjects[i]?.marks.at(-1);
    if (last) setWeight(Math.min(10, Math.max(1, Math.round(last.weight) || 1)));
  };

  return (
    <section className={`card predictor${open ? " open" : ""}`}>
      <div className="pred-head static">
        <span>
          <b className="pred-title">Předvídač průměru</b>
          <small>Vyzkoušej, jak by se průměr změnil s další známkou</small>
        </span>
      </div>
      {open && (
        <div className="pred-body">
          <label className="pred-subjects" style={{ ["--hue" as string]: `var(--h-${subj.hue})` }}>
            <span className="pred-subj-label"><i aria-hidden />Předmět</span>
            <select className="select" value={idx} onChange={(e) => pick(Number(e.target.value))} aria-label="Předmět">
              {subjects.map((s, i) => (
                <option key={s.name} value={i}>{s.name}</option>
              ))}
            </select>
          </label>

          <div className="pred-result">
            <div className="pred-nums">
              <div>
                <small>Teď</small>
                <b>{now != null ? cs(now) : "–"}</b>
              </div>
              <span className="pred-arrow" aria-hidden>→</span>
              <div className={trend}>
                <small>S přidanými</small>
                <b>{next != null ? cs(next) : "–"}</b>
                {trend && <em>{diff < 0 ? "▼" : "▲"} {cs(Math.abs(diff))}</em>}
              </div>
            </div>
            <div className="pred-gauge" aria-hidden>
              <div className="pred-track">
                {now != null && <span className="pred-dot ghost" style={{ left: pos(now) }} />}
                {next != null && <span className={`pred-dot ${trend}`} style={{ left: pos(next) }} />}
                <span className="pred-goal-tick" style={{ left: pos(target) }} />
              </div>
              <div className="pred-scale"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            </div>
          </div>

          <div className="pred-add">
            <div className="pred-grades" role="group" aria-label="Známka">
              {[1, 2, 3, 4, 5].map((g) => (
                <button key={g} type="button" className={`mark g${g}${g === grade ? " on" : ""}`} aria-pressed={g === grade} onClick={() => setGrade(g)}>{g}</button>
              ))}
              <button type="button" className={`pred-minus${minus && grade < 5 ? " on" : ""}`} aria-pressed={minus && grade < 5} disabled={grade === 5} onClick={() => setMinus(!minus)} title="Známka s mínusem">−</button>
            </div>
            <div className="pred-weight" role="group" aria-label="Váha">
              <small>Váha</small>
              {WEIGHTS.map((w) => (
                <button key={w} type="button" className={w === weight ? "on" : ""} aria-pressed={w === weight} onClick={() => setWeight(w)}>{w}</button>
              ))}
            </div>
            <button type="button" className="btn primary" onClick={() => setFake([...fake, { value, weight }])}>Přidat známku</button>
          </div>

          {fake.length > 0 && (
            <div className="pred-fakes">
              {fake.map((m, i) => (
                <button key={i} type="button" className="pred-fake" title="Odebrat" onClick={() => setFake(fake.filter((_, j) => j !== i))}>
                  <span className={`mark ${tile(m.value)}`}>{label(m.value)}</span>
                  <small>váha {m.weight} ✕</small>
                </button>
              ))}
              <button type="button" className="btn small" onClick={() => setFake([])}>Vymazat</button>
            </div>
          )}

          <div className="pred-goal">
            <div className="pred-targets" role="group" aria-label="Cílový průměr">
              <small>Chci mít průměr nejvýš</small>
              {TARGETS.map((t) => (
                <button key={t} type="button" className={t === target ? "on" : ""} aria-pressed={t === target} onClick={() => setTarget(t)}>{String(t).replace(".", ",")}</button>
              ))}
            </div>
            <p className={reached ? "ok" : ""}>
              {now == null ? "" : reached ? "✓ Tenhle průměr už máš." : needs.length ? <>Stačí {needs.map((x, i) => <span key={x.g}>{i ? " nebo " : ""}<b>{x.n}× {WORD[x.g][x.n === 1 ? 0 : x.n < 5 ? 1 : 2]}</b></span>)} s váhou {weight}.</> : `S váhou ${weight} by to nešlo ani s mnoha jedničkami.`}
            </p>
          </div>
          <p className="hint">Odhad z vypsaných známek a jejich vah; výpočet v Bakalářích se může lehce lišit.</p>
        </div>
      )}
    </section>
  );
}
