"use client";

import { useRef, useState } from "react";
import { addRequest } from "@/app/actions/pokladna";
import { Icon } from "./Icon";
import { ActionForm, Submit } from "./forms";

type Member = { id: number; name: string };

/**
 * Okno Nová platba: název, částka, termín, komu (celá třída, skupina, nebo jen vybraní lidé), vlastní částky jednotlivcům a poznámka.
 * Částka u člověka, kde zůstane prázdná, je běžná částka.
 */
export function CashNewRequest({ classId, groups, members }: { classId: number; groups: { id: number; label: string }[]; members: Member[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const people = to === "people";
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reset = () => { setTo(""); setPicked(new Set()); setCustom(false); setAmount(""); };
  const amountRows = people ? members.filter((m) => picked.has(m.id)) : members;
  return (
    <>
      <button type="button" className="btn primary" onClick={() => ref.current?.showModal()}><Icon name="plus" size={16} />Nová platba</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>Nová platba</h2>
          <ActionForm action={addRequest} onSuccess={() => { ref.current?.close(); reset(); }}>
            <input type="hidden" name="class" value={classId} />
            <label className="field"><span>Za co</span><input className="input" name="title" required minLength={2} maxLength={120} placeholder="Např. Kino 12. 11." autoComplete="off" /></label>
            <div className="cash-row">
              <label className="field"><span>Částka na osobu (Kč)</span><input className="input" name="amount" inputMode="decimal" required placeholder="150" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label className="field"><span>Zaplatit do</span><input className="input" type="date" name="due" /></label>
            </div>
            <label className="field"><span>Komu</span>
              <select className="select" name="group" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Celá třída</option>
                {groups.map((g) => <option key={g.id} value={g.id}>Skupina {g.label}</option>)}
                <option value="people">Jen vybraní lidé…</option>
              </select>
            </label>
            {people && (
              <div className="field">
                <span>Kdo platí ({picked.size} z {members.length})</span>
                <div className="btn-row" style={{ marginBottom: 6 }}>
                  <button type="button" className="btn small" onClick={() => setPicked(new Set(members.map((m) => m.id)))}>Vybrat všechny</button>
                  <button type="button" className="btn small" onClick={() => setPicked(new Set())}>Zrušit výběr</button>
                </div>
                <div className="pick-list" role="group" aria-label="Kdo platí">
                  {members.map((m) => (
                    <label key={m.id} className="pick-row"><input type="checkbox" name="people" value={m.id} checked={picked.has(m.id)} onChange={() => toggle(m.id)} /> <span>{m.name}</span></label>
                  ))}
                </div>
              </div>
            )}
            <label className="pick-check"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> <span>Někomu nastavit jinou částku</span></label>
            {custom && (
              <div className="field">
                <span>Vlastní částky (prázdné pole = {amount.trim() ? `${amount.trim()} Kč` : "běžná částka"})</span>
                <div className="pick-list" role="group" aria-label="Vlastní částky">
                  {amountRows.length ? amountRows.map((m) => (
                    <label key={m.id} className="pick-row pick-amt"><span>{m.name}</span><input className="input" name={`amt_${m.id}`} inputMode="decimal" placeholder={amount.trim() || "běžná"} autoComplete="off" /></label>
                  )) : <p className="hint" style={{ margin: 6 }}>Nejdřív vyber lidi výše.</p>}
                </div>
                <p className="hint" style={{ margin: "6px 0 0" }}>Každému můžeš dát úplně jinou částku. Částky lidí mimo vybraný okruh se ignorují.</p>
              </div>
            )}
            <label className="field"><span>Poznámka (nepovinná)</span><textarea className="textarea" name="note" rows={3} maxLength={1000} placeholder="Třeba kam se platí, nebo na co přesně." /></label>
            <p className="hint" style={{ margin: 0 }}>Platba se hned objeví všem v okruhu. Kartou jde zaplatit od 15 Kč a jen když má třída zapnutý Stripe, jinak se označí osobní platba.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <Submit pendingText="Ukládám…">Zadat platbu</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
