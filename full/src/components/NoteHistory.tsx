"use client";

import { useEffect, useRef, useState } from "react";
import { getVersions, restoreVersion } from "@/app/actions/notes";
import type { VersionRow } from "@/lib/note-safety";

const REASON: Record<string, string> = { auto: "automatická záloha", restore: "před obnovením jiné verze", conflict: "při konfliktu", delete: "před smazáním" };
const when = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
const kb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/** Historie verzí poznámky: automatické zálohy a obnovení. Před obnovením se uloží i současný stav, takže jde vrátit i zpět. */
export function NoteHistory({ id, beforeRestore }: { id: number; beforeRestore: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<VersionRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    setList(null);
    getVersions(id).then(setList).catch(() => setError("Historii se nepodařilo načíst."));
  }, [open, id]);

  return (
    <>
      <button type="button" className="btn small hist-btn" onClick={() => { setError(""); setOpen(true); }} title="Historie verzí a obnovení">Historie</button>
      {open && (
        <dialog ref={ref} className="modal" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
          <div className="modal-card">
            <h2>Historie poznámky</h2>
            <p className="hint" style={{ margin: "-8px 0 14px" }}>Aplikace průběžně zálohuje předchozí stavy (a hned, když se text výrazně zkrátí). Obnovením se vrátí text i tabule, současný stav se předtím uloží.</p>
            {error && <p className="msg-error" role="alert">{error}</p>}
            {list === null ? <p className="hint">Načítám…</p> : list.length === 0 ? <p className="hint">Zatím tu nejsou žádné zálohy, vytvoří se při dalších úpravách.</p> : (
              <ul className="ver-list">
                {list.map((v) => (
                  <li key={v.id}>
                    <div>
                      <b>{when(v.created_at)}</b> <span className="hint">· {REASON[v.reason] ?? v.reason} · {kb(v.size)}{v.hasBoard ? " · s tabulí" : ""}</span>
                      <div className="ver-prev">{v.preview.trim() || "(bez textu)"}</div>
                    </div>
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy !== null}
                      onClick={async () => {
                        if (!window.confirm("Obnovit tuhle verzi? Současný stav se předtím uloží do historie.")) return;
                        setBusy(v.id);
                        try {
                          await beforeRestore();
                          const r = await restoreVersion(id, v.id);
                          if (r.ok) window.location.reload();
                          else setError(r.error ?? "Obnovení se nepovedlo.");
                        } catch {
                          setError("Obnovení se nepovedlo.");
                        }
                        setBusy(null);
                      }}
                    >
                      {busy === v.id ? "Obnovuji…" : "Obnovit"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions"><button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button></div>
          </div>
        </dialog>
      )}
    </>
  );
}
