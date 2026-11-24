"use client";

import { useState, type ReactNode } from "react";

export type MarksPane = "latest" | "subjects" | "predictor" | "final";

/**
 * Známky se dělí do částí (Nejnovější, Podle předmětů, Předvídač, Vysvědčení) na každé šířce displeje. Obsah (children) se vykresluje na serveru, záložka jen přepíná, co je vidět (CSS podle data-tab).
 */
export function MarksTabs({ tabs, initial, children }: { tabs: { id: MarksPane; label: string }[]; initial: MarksPane; children: ReactNode }) {
  const [tab, setTab] = useState<MarksPane>(initial);
  return (
    <div className="auto-cols marks-tabs" data-tab={tab}>
      <div className="mtabs span-all" role="tablist" aria-label="Části známek">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`mtab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
