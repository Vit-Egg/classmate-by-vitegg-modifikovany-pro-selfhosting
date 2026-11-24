"use client";

import { useState } from "react";

/** Pole jen ke čtení s tlačítkem Zkopírovat (např. odkaz pro správce školy). */
export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="btn-row" style={{ flexWrap: "nowrap" }}>
      <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Odkaz" />
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          } catch {}
        }}
      >
        {done ? "Zkopírováno" : "Kopírovat"}
      </button>
    </div>
  );
}
