"use client";

import { useEffect, useState } from "react";
import { ACCENTS, applyAccent } from "@/lib/theme";

export function AccentPicker() {
  const [current, setCurrent] = useState("mint");
  useEffect(() => {
    try {
      setCurrent(localStorage.getItem("accent") ?? "mint");
    } catch {}
    const on = (e: Event) => setCurrent((e as CustomEvent<string>).detail);
    window.addEventListener("classmate:accent", on);
    return () => window.removeEventListener("classmate:accent", on);
  }, []);
  return (
    <div className="swatches" role="radiogroup" aria-label="Barva">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={current === a.id}
          aria-label={a.name}
          title={a.name}
          className="swatch"
          style={{ background: `light-dark(${a.light[0]}, ${a.dark[0]})` }}
          onClick={() => applyAccent(a.id)}
        />
      ))}
    </div>
  );
}
