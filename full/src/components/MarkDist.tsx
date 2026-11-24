"use client";

import { useEffect, useRef, useState } from "react";

type Dist = { subject: string; caption: string; mine: number; enough: boolean; min: number; total?: number; better?: number; counts: { value: number; n: number }[] };

const label = (v: number) => (Number.isInteger(v) ? String(v) : `${Math.floor(v)}-`);
const cs = (n: number) => n.toFixed(2).replace(".", ",");
const grade = (v: number) => Math.min(5, Math.max(1, Math.round(v + 0.01)));

/**
 * Po kliknutí na známku (řádek s data-mark) ukáže anonymní rozdělení známek ostatních u téhle písemky.
 * Jeden dialog pro celou stránku, řádky se zachytávají společně (klik i Enter).
 */
export function MarkDist() {
  const ref = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState<Dist | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const open = async (id: string) => {
      setD(null);
      setErr("");
      ref.current?.showModal();
      try {
        const r = await fetch(`/api/znamky/${encodeURIComponent(id)}/rozdeleni`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        setD((await r.json()) as Dist);
      } catch {
        setErr("Rozdělení se nepodařilo načíst.");
      }
    };
    const on = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") return;
      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-mark]");
      if (!row || (e.target as HTMLElement).closest("a, button")) return;
      e.preventDefault();
      void open(row.dataset.mark!);
    };
    document.addEventListener("click", on);
    document.addEventListener("keydown", on);
    return () => {
      document.removeEventListener("click", on);
      document.removeEventListener("keydown", on);
    };
  }, []);

  const max = d ? Math.max(...d.counts.map((c) => c.n), 1) : 1;
  const avg = d?.total ? d.counts.reduce((a, c) => a + c.value * c.n, 0) / d.total : null;

  return (
    <dialog ref={ref} className="modal" aria-label="Rozdělení známek" onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="modal-card">
        <h2>Jak to dopadlo ostatním</h2>
        {d && <p className="hint" style={{ margin: "4px 0 16px" }}>{d.subject} · {d.caption}</p>}
        {!d && !err && <p className="hint">Načítám…</p>}
        {err && <p className="msg-error" role="alert">{err}</p>}
        {d && !d.enough && <p className="hint">Tuhle známku zatím sdílí málo lidí, aby se dalo anonymně ukázat rozdělení (potřeba aspoň {d.min}).</p>}
        {d?.enough && (
          <>
            <div className="dist">
              {d.counts.map((c) => (
                <div key={c.value} className={`dist-row${c.value === d.mine ? " mine" : ""}`}>
                  <b className={`mark g${grade(c.value)}`}>{label(c.value)}</b>
                  <span className="dist-bar"><i className={`g${grade(c.value)}`} style={{ width: `${(c.n / max) * 100}%` }} /></span>
                  <span className="dist-n">{c.n}×{c.value === d.mine ? " · ty" : ""}</span>
                </div>
              ))}
            </div>
            {d.better != null && <p className="dist-better"><b>{d.better} %</b> ostatních na tom bylo hůř než ty</p>}
            <p className="hint" style={{ margin: "14px 0 0" }}>Celkem {d.total} lidí{avg != null ? `, průměr ${cs(avg)}` : ""}. Anonymně, jen od těch, kdo sdílejí známky, bez jmen.</p>
          </>
        )}
        <div className="btn-row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button>
        </div>
      </div>
    </dialog>
  );
}
