"use client";

import { useRef } from "react";
import { CashClassForm } from "./CashClassForm";
import { DutyClassForm } from "./DutyClassForm";
import { BoardClassForm } from "./BoardClassForm";

/** Přídavné moduly třídy na jednom místě (Správa → třída → Přídavné moduly): povolení a nastavení každého z nich. */
export function ClassModulesDialog(p: { classId: number; name: string; cashEnabled: boolean; stripeOn: boolean; cardOn: boolean; last4: string; webhookUrl: string; dutyEnabled: boolean; boardEnabled: boolean; personalOn: boolean; qrOn: boolean; qrAccount: string; qrName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const active = Number(p.cashEnabled) + Number(p.dutyEnabled) + Number(p.boardEnabled);
  return (
    <>
      <button type="button" className="btn small" onClick={() => ref.current?.showModal()}>Přídavné moduly{active ? ` · ${active}` : ""}</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>Přídavné moduly · {p.name}</h2>
          <p className="hint" style={{ margin: "-8px 0 18px" }}>Volitelné části aplikace. Povolíš je jen té třídě, která je chce.</p>
          <section className="module-sec">
            <h3 className="section">Nástěnka třídy</h3>
            <BoardClassForm classId={p.classId} enabled={p.boardEnabled} />
          </section>
          <section className="module-sec">
            <h3 className="section">Třídní služby</h3>
            <DutyClassForm classId={p.classId} enabled={p.dutyEnabled} />
          </section>
          <section className="module-sec">
            <h3 className="section">Pokladna</h3>
            <CashClassForm classId={p.classId} enabled={p.cashEnabled} stripeOn={p.stripeOn} cardOn={p.cardOn} last4={p.last4} webhookUrl={p.webhookUrl} personalOn={p.personalOn} qrOn={p.qrOn} qrAccount={p.qrAccount} qrName={p.qrName} />
          </section>
          <div className="modal-actions"><button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button></div>
        </div>
      </dialog>
    </>
  );
}
