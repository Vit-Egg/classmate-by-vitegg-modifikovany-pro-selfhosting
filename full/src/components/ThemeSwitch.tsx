"use client";

import { useEffect, useState } from "react";
import { applyTheme, type ThemeMode } from "@/lib/theme";

const labels: [ThemeMode, string][] = [["auto", "Podle zařízení"], ["sun", "Podle slunce"], ["light", "Světlý"], ["dark", "Tmavý"]];

export function ThemeSwitch() {
  const [mode, setMode] = useState<ThemeMode>("sun");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark" || saved === "sun" || saved === "auto") setMode(saved);
    } catch {}
    const on = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener("classmate:theme", on);
    return () => window.removeEventListener("classmate:theme", on);
  }, []);
  return (
    <div className="seg" role="group" aria-label="Vzhled">
      {labels.map(([m, label]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => applyTheme(m)}>
          {label}
        </button>
      ))}
    </div>
  );
}
