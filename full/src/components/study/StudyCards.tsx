"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/study";
import { SwitchRow } from "../SwitchRow";
import { Rich } from "./Rich";

const shuffled = (n: number) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Kartičky: velká otáčecí karta, pruh se všemi kartami a postranní panel s postupem. Co umíš, se ukládá k účtu. */
export function StudyCards({ cards, initialKnown, onChange }: { cards: Card[]; initialKnown: number[]; onChange: (known: number[]) => void }) {
  const [known, setKnown] = useState<number[]>(() => initialKnown.filter((i) => i < cards.length));
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [todo, setTodo] = useState(false);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const list = useMemo(() => (todo ? order.filter((i) => !known.includes(i)) : order), [order, known, todo]);
  const at = Math.min(pos, Math.max(list.length - 1, 0));
  const cur = list.length ? list[at] : -1;
  const pct = Math.round((known.length / cards.length) * 100);

  const save = (next: number[]) => {
    setKnown(next);
    onChange(next);
  };
  const go = useCallback((p: number) => {
    setFlipped(false);
    setPos(list.length ? ((p % list.length) + list.length) % list.length : 0);
  }, [list.length]);

  const mark = useCallback((knew: boolean) => {
    if (cur < 0) return;
    const has = known.includes(cur);
    if (knew && !has) save([...known, cur]);
    if (!knew && has) save(known.filter((x) => x !== cur));
    setFlipped(false);
    // V režimu „jen co neumím“ karta po označení zmizí ze seznamu, takže na stejné pozici už je další.
    if (!(todo && knew)) setPos(at + 1 >= list.length ? 0 : at + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, known, todo, at, list.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (e.key === " ") {
        if (t?.closest("a, .study-actions, .study-side, .study-segs")) return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(at + 1);
      else if (e.key === "ArrowLeft") go(at - 1);
      else if (e.key === "u" || e.key === "U") mark(true);
      else if (e.key === "n" || e.key === "N") mark(false);
      else return;
      e.stopImmediatePropagation(); // klávesy procvičování mají přednost před globálními zkratkami (U = úkoly)
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, mark, at]);

  const side = (
    <aside className="study-side card card-pad">
      <div className="study-ring" style={{ ["--pct" as string]: `${pct}%` }}><b>{pct} %</b><small>umíš</small></div>
      <dl className="study-facts">
        <div><dt>Umíš</dt><dd>{known.length}</dd></div>
        <div><dt>Zbývá</dt><dd>{cards.length - known.length}</dd></div>
        <div><dt>Celkem</dt><dd>{cards.length}</dd></div>
      </dl>
      <SwitchRow label="Jen co neumím" hint="Skryje karty, které už umíš" checked={todo} onChange={(v) => { setTodo(v); setPos(0); setFlipped(false); }} />
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn small" onClick={() => { setOrder(shuffled(cards.length)); setPos(0); setFlipped(false); }}>Zamíchat</button>
        <button type="button" className="btn small" onClick={() => { save([]); setPos(0); setFlipped(false); }} disabled={!known.length}>Začít znovu</button>
      </div>
      <p className="study-keys">
        <span><kbd>mezerník</kbd> otočit</span>
        <span><kbd>←</kbd><kbd>→</kbd> přepnout</span>
        <span><kbd>U</kbd> umím <kbd>N</kbd> ještě ne</span>
      </p>
    </aside>
  );

  if (!list.length) {
    return (
      <div className="study-split">
        <div className="card study-done">
          <div className="study-hero-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg></div>
          <h3>Všech {cards.length} kartiček umíš</h3>
          <p>Skvělá práce. Zkus ještě procvičování, nebo si kartičky projdi znovu.</p>
          <button type="button" className="btn" onClick={() => { setTodo(false); setPos(0); }}>Zobrazit všechny kartičky</button>
        </div>
        {side}
      </div>
    );
  }

  const card = cards[cur];
  const isKnown = known.includes(cur);
  return (
    <div className="study-split">
      <div className="study-main">
        <div className="study-segs" role="group" aria-label="Kartičky">
          {list.map((i, k) => (
            <button key={i} type="button" className={`${known.includes(i) ? "known" : ""}${k === at ? " now" : ""}`} onClick={() => go(k)} aria-label={`Kartička ${k + 1}${known.includes(i) ? ", umíš" : ""}`} aria-current={k === at} />
          ))}
        </div>
        <div className={`fc${flipped ? " flipped" : ""}`}>
          <button type="button" className="fc-inner" onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Odpověď, klepnutím zobrazíš otázku" : "Otázka, klepnutím zobrazíš odpověď"}>
            <span className="fc-face fc-front">
              <span className="fc-top"><b>Otázka</b><i>{isKnown && <em>Umíš</em>}{at + 1} / {list.length}</i></span>
              <span className="fc-text"><Rich text={card.q} /></span>
              <span className="fc-hint">Klepnutím otočíš</span>
            </span>
            <span className="fc-face fc-back" aria-hidden={!flipped}>
              <span className="fc-top"><b>Odpověď</b><i>{isKnown && <em>Umíš</em>}{at + 1} / {list.length}</i></span>
              <span className="fc-text fc-answer"><Rich text={card.a} /></span>
              <span className="fc-hint">Klepnutím se vrátíš</span>
            </span>
          </button>
        </div>
        <div className="study-actions">
          <button type="button" className="btn study-prev" onClick={() => go(at - 1)} aria-label="Předchozí kartička">←</button>
          <button type="button" className="btn study-no" onClick={() => mark(false)}>Ještě ne</button>
          <button type="button" className="btn study-yes" onClick={() => mark(true)}>Umím</button>
          <button type="button" className="btn study-prev" onClick={() => go(at + 1)} aria-label="Další kartička">→</button>
        </div>
      </div>
      {side}
    </div>
  );
}
