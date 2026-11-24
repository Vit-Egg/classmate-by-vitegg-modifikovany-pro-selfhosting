"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Rozbalovací okno u tlačítka. Zavírá se klikem mimo / Esc a když by se nevešlo pod tlačítko,
 * otevře se nad ním (aby nepřesáhlo konec stránky).
 */
export function PopoverMenu({ label, children, small = true, danger = false, primary = false }: { label: ReactNode; children: ReactNode; small?: boolean; danger?: boolean; primary?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const p = pop.current;
      if (!el.open || !p) return;
      el.classList.remove("up", "left");
      // tlačítko v levé polovině okna: okno zarovnat doleva, ať nepřesáhne postranní panel
      if (el.getBoundingClientRect().left < window.innerWidth / 2 - 60 && el.getBoundingClientRect().left + p.offsetWidth < window.innerWidth - 20) el.classList.add("left");
      const need = p.offsetHeight + 12;
      const below = window.innerHeight - el.getBoundingClientRect().bottom;
      const above = el.getBoundingClientRect().top;
      if (below < need && above > below) el.classList.add("up");
    };
    const onToggle = () => {
      if (el.open) {
        place();
        el.querySelector<HTMLElement>("input, select, textarea")?.focus();
      }
    };
    const outside = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.removeAttribute("open");
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && el.removeAttribute("open");
    el.addEventListener("toggle", onToggle);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    return () => {
      el.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <details ref={ref} className="inline">
      <summary className={`btn${small ? " small" : ""}${danger ? " danger" : ""}${primary ? " primary" : ""}`}>{label}</summary>
      <div className="pop" ref={pop}>
        {children}
      </div>
    </details>
  );
}
