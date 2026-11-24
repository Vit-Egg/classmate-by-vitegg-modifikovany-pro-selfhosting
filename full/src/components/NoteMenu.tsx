"use client";

import { useEffect, useRef } from "react";
import { deleteNote, duplicate, togglePin, toggleShare } from "@/app/actions/notes";

/** Nabídka „⋯“ u poznámky: připnout, sdílet, duplikovat, smazat. */
export function NoteMenu({ id, pinned, shared }: { id: number; pinned: boolean; shared: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && ref.current?.removeAttribute("open");
    const el = ref.current;
    const place = () => {
      const p = el?.querySelector<HTMLElement>(".menu-pop");
      if (!el?.open || !p) return;
      el.classList.remove("up");
      const below = window.innerHeight - el.getBoundingClientRect().bottom;
      if (below < p.offsetHeight + 12 && el.getBoundingClientRect().top > below) el.classList.add("up");
    };
    el?.addEventListener("toggle", place);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      el?.removeEventListener("toggle", place);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const item = (action: (fd: FormData) => void | Promise<void>, label: string, opts: { danger?: boolean; disabled?: boolean; hint?: string; confirm?: string } = {}) => (
    <form
      action={action}
      onSubmit={(e) => {
        if (opts.confirm && !window.confirm(opts.confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className={`menu-item${opts.danger ? " danger" : ""}`} disabled={opts.disabled} title={opts.hint}>
        {label}
      </button>
    </form>
  );

  return (
    <details ref={ref} className="menu">
      <summary className="icon-btn" aria-label="Možnosti poznámky" title="Možnosti">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </summary>
      <div className="menu-pop" role="menu">
        {item(togglePin, pinned ? "Odepnout" : "Připnout")}
        {item(toggleShare, shared ? "Nesdílet tuto poznámku" : "Sdílet se třídou")}
        {item(duplicate, "Duplikovat")}
        <a className="menu-item" href={`/poznamky/${id}/stahnout`} download role="menuitem">Stáhnout (.md)</a>
        <hr />
        {item(deleteNote, "Smazat (do koše)", { danger: true, confirm: "Přesunout tuhle poznámku do koše? Do 30 dní ji můžeš obnovit." })}
      </div>
    </details>
  );
}
