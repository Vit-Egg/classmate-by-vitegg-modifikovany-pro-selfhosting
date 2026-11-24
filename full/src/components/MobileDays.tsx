"use client";

import { useState, type ReactNode } from "react";

export type DayTab = { label: string; sub?: string; today: boolean };

/** Rozvrh na telefonu: záložky Po–Pá a jen hodiny vybraného dne (místo široké mřížky). */
export function MobileDays({ tabs, panels, initial }: { tabs: DayTab[]; panels: ReactNode[]; initial: number }) {
  const [i, setI] = useState(initial);
  return (
    <div className="tt-mobile">
      <div className="mday-tabs" role="tablist" aria-label="Den v týdnu">
        {tabs.map((t, k) => (
          <button key={k} role="tab" aria-selected={i === k} className={`mday-tab${t.today ? " today" : ""}`} onClick={() => setI(k)}>
            {t.label}
            {t.sub && <small>{t.sub}</small>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mday-list">{panels[i]}</div>
    </div>
  );
}
