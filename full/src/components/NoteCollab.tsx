"use client";

import { useEffect, useRef, useState } from "react";
import { getCollabInfo, inviteToNote, removeFromNote, type CollabInfo } from "@/app/actions/notes";

/** Zapíše rozepsané změny v editoru (ten na tuhle událost odpoví), než se stránka načte znovu. */
const flushEditor = async () => {
  const detail = { promises: [] as Promise<unknown>[] };
  window.dispatchEvent(new CustomEvent("classmate:note-flush", { detail }));
  await Promise.all(detail.promises);
};

/** Společná úprava poznámky: vlastník zve spolužáky, spolupracovník vidí, kdo se podílí, a může odejít. */
export function NoteCollab({ id, count, owner }: { id: number; count: number; owner: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<CollabInfo | null | undefined>(undefined);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    setInfo(undefined);
    getCollabInfo(id).then(setInfo).catch(() => setError("Seznam se nepodařilo načíst."));
  }, [open, id]);

  const reloadAfter = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError("");
    try {
      await flushEditor();
      const r = await fn();
      if (r.ok) window.location.reload(); // režim editoru se mění (samostatná poznámka ⇄ společná), proto celé načtení
      else setError(r.error ?? "Nepovedlo se.");
    } catch {
      setError("Nepovedlo se.");
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className={`btn small${count ? " primary" : ""}`} onClick={() => { setError(""); setOpen(true); }} title={owner ? "Pozvi spolužáka, který bude poznámku upravovat spolu s tebou" : "Kdo na poznámce spolupracuje"}>
        {count ? `Spolupráce · ${count}` : owner ? "Pozvat k úpravě" : "Spolupráce"}
      </button>
      {open && (
        <dialog ref={ref} className="modal" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
          <div className="modal-card">
            <h2>Společná úprava</h2>
            <p className="hint" style={{ margin: "-8px 0 14px" }}>
              {owner
                ? "Pozvaný spolužák poznámku uvidí a bude ji s tebou upravovat v reálném čase. Poznámka zůstává tvoje: jen ty ji můžeš smazat, sdílet nebo vrátit do dřívější verze, a kdykoliv můžeš pozvaného odebrat."
                : "Poznámku vlastní někdo jiný. Upravuješ ji spolu s ním v reálném čase; smazat nebo sdílet ji může jen vlastník."}
            </p>
            {error && <p className="msg-error" role="alert">{error}</p>}
            {info === undefined ? <p className="hint">Načítám…</p> : info === null ? <p className="hint">K poznámce už nemáš přístup.</p> : (
              <>
                <ul className="collab-list">
                  <li><span><b>{info.owner}</b> <span className="hint">· vlastník</span></span></li>
                  {info.collaborators.map((c) => (
                    <li key={c.id}>
                      <span>{c.name}</span>
                      {info.mine && (
                        <button type="button" className="btn small danger" disabled={busy} onClick={() => reloadAfter(() => removeFromNote(id, c.id))}>Odebrat</button>
                      )}
                    </li>
                  ))}
                </ul>
                {info.mine ? (
                  info.invitable.length ? (
                    <div className="btn-row" style={{ marginTop: 14 }}>
                      <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Koho pozvat">
                        <option value="">Vyber spolužáka…</option>
                        {info.invitable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button type="button" className="btn primary" disabled={!pick || busy} onClick={() => reloadAfter(() => inviteToNote(id, Number(pick)))}>Pozvat</button>
                    </div>
                  ) : <p className="hint" style={{ marginTop: 14 }}>Není koho dalšího pozvat (jde jen o spolužáky, kteří mají v aplikaci účet).</p>
                ) : (
                  <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                    <MeLeave id={id} infoList={info} busy={busy} onLeave={async (uid) => {
                      setBusy(true);
                      const r = await removeFromNote(id, uid).catch(() => ({ ok: false, error: "Nepovedlo se." }));
                      if (r.ok) window.location.href = "/poznamky";
                      else {
                        setError(r.error ?? "Nepovedlo se.");
                        setBusy(false);
                      }
                    }} />
                  </div>
                )}
              </>
            )}
            <div className="modal-actions"><button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button></div>
          </div>
        </dialog>
      )}
    </>
  );
}

/** „Odejít z poznámky“: spolupracovník se najde podle sebe (server odebírá jen jeho samotného). */
function MeLeave({ infoList, busy, onLeave }: { id: number; infoList: CollabInfo; busy: boolean; onLeave: (userId: number) => void | Promise<void> }) {
  return (
    <button type="button" className="btn danger" disabled={busy} onClick={() => window.confirm("Opustit tuhle poznámku? Znovu se k ní dostaneš jen novým pozváním.") && onLeave(infoList.me)}>
      Opustit poznámku
    </button>
  );
}
