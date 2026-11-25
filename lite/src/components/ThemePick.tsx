"use client";

import { useEffect, useState } from "react";
import { ACCENTS, applyAccent, applyTheme, type ThemeMode } from "@/lib/theme";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "sun", label: "Podle slunce" },
  { id: "auto", label: "Podle zařízení" },
  { id: "light", label: "Světlý" },
  { id: "dark", label: "Tmavý" },
];

/** Motiv a barva jako ve starém Classmate. V rámu Classmate se motiv bere z Classmate. */
export function ThemePick() {
  const [mode, setMode] = useState<ThemeMode>("sun");
  const [accent, setAccent] = useState("mint");
  useEffect(() => {
    try {
      setMode((localStorage.getItem("theme") as ThemeMode) || "sun");
      setAccent(localStorage.getItem("accent") || "mint");
    } catch {}
  }, []);
  return (
    <div className="stack">
      <nav className="seg" aria-label="Motiv">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => { applyTheme(m.id); setMode(m.id); }}>{m.label}</button>
        ))}
      </nav>
      <div className="btn-row">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.name}
            aria-pressed={accent === a.id}
            onClick={() => { applyAccent(a.id); setAccent(a.id); }}
            style={{ width: 30, height: 30, borderRadius: 999, border: accent === a.id ? "3px solid var(--text)" : "1px solid var(--border-strong)", background: `light-dark(${a.light[0]}, ${a.dark[0]})` }}
          />
        ))}
      </div>
    </div>
  );
}
