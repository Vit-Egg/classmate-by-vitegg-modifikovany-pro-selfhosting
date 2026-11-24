"use client";

import { useEffect, useRef, type ReactNode } from "react";

const KEY = "marks_charts_open";

/** Rozbalovací část s grafy nad známkami. Ve výchozím stavu je sbalená (většinou člověk jde pro známky), volba se pamatuje v prohlížeči. V záhlaví zůstávají hlavní čísla. */
export function ChartsFold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "1" && ref.current) ref.current.open = true; } catch {}
  }, []);
  return (
    <details ref={ref} className="charts-fold" onToggle={(e) => { try { localStorage.setItem(KEY, (e.currentTarget as HTMLDetailsElement).open ? "1" : "0"); } catch {} }}>
      <summary>
        <span className="cf-title">Grafy a průměry</span>
        <span className="cf-sum">{summary}</span>
        <span className="cf-chev" aria-hidden>▾</span>
      </summary>
      <div className="cf-body">{children}</div>
    </details>
  );
}
