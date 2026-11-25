"use client";

import { useState } from "react";

export function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="btn-row" style={{ flexWrap: "nowrap" }}>
      <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Adresa" style={{ fontSize: 13 }} />
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          } catch {}
        }}
      >
        {done ? "Zkopírováno" : "Kopírovat"}
      </button>
    </div>
  );
}
