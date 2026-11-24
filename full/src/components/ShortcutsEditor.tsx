"use client";

import { useEffect, useState, useTransition } from "react";
import { saveShortcuts } from "@/app/actions/settings";
import { SHORTCUTS, checkKey, resolveKeys, type KeyMap, type ShortcutId } from "@/lib/shortcuts";

/** Změna kláves jednoklávesových zkratek. Klikni na klávesu, stiskni novou; ukládá se hned. */
export function ShortcutsEditor({ initial, isAdmin }: { initial: KeyMap; isAdmin: boolean }) {
  const [keys, setKeys] = useState<KeyMap>(initial);
  const [listening, setListening] = useState<ShortcutId | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const rows = SHORTCUTS.filter((s) => !s.admin || isAdmin);
  const defaults = resolveKeys(null);

  const persist = (next: KeyMap) =>
    start(async () => {
      const r = await saveShortcuts(next);
      if (r.error) {
        setError(r.error);
        setKeys(keys);
      }
    });

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return void setListening(null);
      const bad = checkKey(e.key);
      const clash = SHORTCUTS.find((s) => s.id !== listening && keys[s.id].toLowerCase() === e.key.toLowerCase());
      if (bad || clash) return void setError(bad ?? `Klávesa ${e.key} je už u položky „${clash!.label}“.`);
      const next = { ...keys, [listening]: e.key.length === 1 ? e.key.toLowerCase() : e.key };
      setError("");
      setKeys(next);
      setListening(null);
      persist(next);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, keys]);

  const changed = rows.some((s) => keys[s.id] !== defaults[s.id]);
  return (
    <div>
      <div className="card rows">
        {rows.map((s) => (
          <div key={s.id} className="switch-row" style={{ padding: "10px 20px" }}>
            <b style={{ fontWeight: 500 }}>{s.label}</b>
            <button type="button" className={`key-btn${listening === s.id ? " listening" : ""}`} onClick={() => { setError(""); setListening(listening === s.id ? null : s.id); }} aria-label={`Klávesa pro ${s.label}: ${keys[s.id]}. Klikni a stiskni novou.`}>
              {listening === s.id ? "Stiskni klávesu…" : <kbd>{keys[s.id]}</kbd>}
            </button>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: "10px 0 0" }}>
        Zkratka je jedna klávesa, ? zůstává nápověda. {error && <span className="msg-error" role="alert">{error}</span>}
      </p>
      {changed && (
        <button type="button" className="link-btn" style={{ marginTop: 10 }} disabled={pending} onClick={() => { setKeys(defaults); setError(""); persist(defaults); }}>
          Obnovit výchozí klávesy
        </button>
      )}
    </div>
  );
}
