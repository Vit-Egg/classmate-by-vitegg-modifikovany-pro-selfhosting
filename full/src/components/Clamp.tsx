"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Dlouhý text (zadání testu, poznámka k úkolu) se ukáže zkrácený na pár řádků s odkazem Zobrazit více; krátký text zůstane celý bez odkazu. */
export function Clamp({ text, lines = 3, className = "item-note" }: { text: string; lines?: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!open) setMore(el.scrollHeight - el.clientHeight > 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  return (
    <div className="clamp">
      <p ref={ref} className={`${className} clamp-text${open ? " open" : ""}`} style={{ ["--lines" as string]: lines }}>{text}</p>
      {(more || open) && <button type="button" className="clamp-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Zobrazit méně" : "Zobrazit více"}</button>}
    </div>
  );
}
