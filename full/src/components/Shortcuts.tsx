"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { SHORTCUTS, type KeyMap } from "@/lib/shortcuts";

/** Jednoklávesové zkratky (klávesy si každý nastaví v Nastavení). Fungují jen mimo formuláře a editor. */
export function Shortcuts({ isAdmin, keys }: { isAdmin: boolean; keys: KeyMap }) {
  const router = useRouter();
  const help = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const byKey = new Map(SHORTCUTS.filter((s) => !s.admin || isAdmin).map((s) => [keys[s.id].toLowerCase(), s]));
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".excalidraw") || el?.closest?.("input, textarea, select, [contenteditable], dialog[open], .excalidraw")) return;
      if (e.key === "?") return void help.current?.showModal();
      const s = byKey.get(e.key.toLowerCase());
      if (!s) return;
      if (s.href) (window.dispatchEvent(new Event("classmate:nav-start")), router.push(s.href));
      else if (s.id === "zpravy") window.dispatchEvent(new Event("classmate:messages"));
      else if (s.id === "novy") {
        document.querySelector<HTMLButtonElement>("[data-new]")?.click();
        e.preventDefault();
      } else if (s.id === "hledat") {
        document.querySelector<HTMLInputElement>("input[type=search], input[name=q]")?.focus();
        e.preventDefault();
      }
    };
    const open = () => help.current?.showModal();
    window.addEventListener("keydown", onKey);
    window.addEventListener("classmate:help", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("classmate:help", open);
    };
  }, [router, isAdmin, keys]);

  return (
    <dialog ref={help} className="modal" onClick={(e) => e.target === help.current && help.current.close()}>
      <div className="modal-card">
        <h2>Zkratky</h2>
        <dl className="keys">
          {SHORTCUTS.filter((x) => !x.admin || isAdmin).map((x) => (
            <div key={x.id}>
              <dt><kbd>{keys[x.id]}</kbd></dt>
              <dd>{x.label}</dd>
            </div>
          ))}
          <div><dt><kbd>?</kbd></dt><dd>Tahle nápověda</dd></div>
          <div><dt><kbd>⌘</kbd> <kbd>K</kbd></dt><dd>Příkazová paleta (Ctrl+K na Windows)</dd></div>
        </dl>
        <p className="hint" style={{ margin: "0 0 14px" }}>Zkratky nefungují, když píšeš do políčka nebo do poznámky. Klávesy si změníš v <Link href="/nastaveni?k=obecne#zkratky" onClick={() => help.current?.close()}>Nastavení</Link>.</p>
        <div className="modal-actions">
          <button className="btn" onClick={() => help.current?.close()}>Zavřít</button>
        </div>
      </div>
    </dialog>
  );
}
