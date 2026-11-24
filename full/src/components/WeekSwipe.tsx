"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Týdny vedle sebe jako karty, mezi kterými se listuje doleva a doprava (šipkami, štítky týdnů nebo přejetím prstem).
 * Uvnitř karty jsou dny pod sebou. Obsah karet se vykresluje na serveru, tohle řeší jen listování.
 */
export function WeekSwipe({ labels, children }: { labels: string[]; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const cards = Children.toArray(children);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // Aktivní karta se bere jen z polohy posuvu (každá karta je široká jako celý pruh). Dřív se na konci seznamu vynucovala poslední karta,
    // jenže dokud prohlížeč nespočítal rozložení (jiný prohlížeč, pomalé načtení písma nebo stylů), vyšel pruh "na konci" a ukázal se poslední týden.
    const onScroll = () => {
      const w = el.clientWidth;
      if (w < 50) return; // rozložení ještě není spočítané
      const max = Math.max(0, Math.round(el.scrollWidth / w) - 1);
      setActive(Math.max(0, Math.min(max, Math.round(el.scrollLeft / w))));
    };
    // během listování jsou vidět všechny karty, po zastavení jen ta aktivní (ať pod krátkým týdnem nezůstane prázdné místo po dlouhém)
    const onMove = () => {
      el.classList.add("moving");
      onScroll();
      clearTimeout(settle.current);
      settle.current = setTimeout(() => el.classList.remove("moving"), 160);
    };
    onScroll();
    el.addEventListener("scroll", onMove, { passive: true });
    // po změně velikosti okna se karta znovu zarovná podle aktivního týdne, ať se nezobrazí rozpůlená
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w < 50 || w === lastW) return; // výška se mění při přepnutí týdne, to sem nepatří
      lastW = w;
      el.scrollLeft = activeRef.current * w;
    });
    ro.observe(el);
    return () => {
      clearTimeout(settle.current);
      el.removeEventListener("scroll", onMove);
      ro.disconnect();
    };
  }, [cards.length]);

  // aktivní štítek týdne se vždy zobrazí v liště
  useEffect(() => {
    const bar = chips.current;
    const chip = bar?.children[active] as HTMLElement | undefined;
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  const go = (i: number) => {
    const el = track.current;
    const kid = el?.children[Math.max(0, Math.min(cards.length - 1, i))] as HTMLElement | undefined;
    if (!el || !kid) return;
    // cílová karta musí být před posunem rozbalená, jinak by se k ní posun nezachytil
    el.classList.add("moving");
    clearTimeout(settle.current);
    settle.current = setTimeout(() => el.classList.remove("moving"), 600);
    el.scrollTo({ left: kid.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return (
    <div className="wk">
      {cards.length > 1 && (
        <div className="wk-bar">
          <button type="button" className="icon-btn" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Předchozí týden">←</button>
          <div className="wk-chips" role="tablist" aria-label="Týdny" ref={chips}>
            {labels.map((l, i) => (
              <button key={i} type="button" role="tab" aria-selected={active === i} className={`wk-chip${active === i ? " on" : ""}`} onClick={() => go(i)}>{l}</button>
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={() => go(active + 1)} disabled={active >= cards.length - 1} aria-label="Další týden">→</button>
        </div>
      )}
      <div className="wk-track" ref={track}>
        {cards.map((c, i) => (
          <div key={i} className={`wk-card${active === i ? " on" : ""}`} aria-hidden={active === i ? undefined : true}>{c}</div>
        ))}
      </div>
    </div>
  );
}
