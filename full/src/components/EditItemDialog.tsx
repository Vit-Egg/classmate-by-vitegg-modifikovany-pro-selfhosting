"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dayName, dayShort } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import { ActionForm, Submit } from "./forms";
import { Icon } from "./Icon";
import { SwitchRow } from "./SwitchRow";

export type EditableItem =
  | { kind: "task"; id: number; title: string; due: string; note: string }
  | { kind: "test"; id: number; subject: string; date: string; topic: string; makeup: boolean; oral: boolean; /** dny výuky předmětu (1–5), prázdné = neomezovat */ days: number[] };

/** Úprava úkolu, testu nebo zkoušení. Obsah se vykreslí až po otevření, takže seznamy zůstávají lehké. */
export function EditItemDialog({ item, action, autoOpen = false }: { item: EditableItem; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const path = usePathname();
  const [oralNow, setOralNow] = useState(item.kind === "test" && item.oral);
  const noun = item.kind === "task" ? "úkol" : oralNow ? "zkoušení" : "test";

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    router.replace(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
  }, [open]);

  return (
    <>
      <button type="button" className="icon-btn" aria-label={`Upravit ${noun}`} title="Upravit" onClick={() => setOpen(true)}>
        <Icon name="pen" size={16} />
      </button>
      {open && (
        <dialog ref={ref} className="modal" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
          <div className="modal-card">
            <h2>Upravit {noun}</h2>
            {item.kind === "task" ? <TaskFields item={item} action={action} close={() => ref.current?.close()} /> : <TestFields item={item} action={action} close={() => ref.current?.close()} onOral={setOralNow} />}
          </div>
        </dialog>
      )}
    </>
  );
}

function TaskFields({ item, action, close }: { item: Extract<EditableItem, { kind: "task" }>; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; close: () => void }) {
  return (
    <ActionForm action={action} onSuccess={close} resetOnSuccess={false}>
      <input type="hidden" name="id" value={item.id} />
      <label className="field">
        <span>Co je potřeba udělat</span>
        <input className="input" name="title" required maxLength={200} autoComplete="off" defaultValue={item.title} autoFocus />
      </label>
      <label className="field">
        <span>Termín</span>
        <input className="input" type="date" name="due" defaultValue={item.due} />
      </label>
      <label className="field">
        <span>Poznámka</span>
        <textarea className="textarea" name="note" maxLength={2000} rows={4} defaultValue={item.note} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>Zrušit</button>
        <Submit>Uložit</Submit>
      </div>
    </ActionForm>
  );
}

function TestFields({ item, action, close, onOral }: { item: Extract<EditableItem, { kind: "test" }>; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; close: () => void; onOral: (v: boolean) => void }) {
  const [date, setDate] = useState(item.date);
  const [outside, setOutside] = useState(false);
  const [makeup, setMakeup] = useState(item.makeup);
  const [oral, setOralRaw] = useState(item.oral);
  const setOral = (v: boolean) => { setOralRaw(v); onOral(v); };
  const dow = date ? ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1 : 0;
  const offDay = !!date && dow <= 5 && item.days.length > 0 && !item.days.includes(dow);
  const weekend = !!date && dow > 5;
  const blocked = weekend || (offDay && !outside);
  return (
    <ActionForm action={action} onSuccess={close} resetOnSuccess={false}>
      <input type="hidden" name="id" value={item.id} />
      <div className="field">
        <span>Předmět</span>
        <div className="scope-static">{item.subject}</div>
      </div>
      <label className="field">
        <span>Datum</span>
        <input className="input" type="date" name="date" required value={date} onChange={(e) => { setDate(e.target.value); setOutside(false); }} />
        {weekend && <p className="msg-error" role="alert" style={{ marginTop: 8 }}>Test ani zkoušení nejde zadat na víkend.</p>}
      </label>
      {offDay && (
        <div className="field">
          <p className="hint" style={{ marginBottom: 4 }}>
            {item.subject} se v {dayName(dow).toLowerCase()} podle stálého rozvrhu neučí (učí se: {item.days.map((d) => dayShort(d)).join(", ")}).
          </p>
          <SwitchRow label="Tento den je opravdu test nebo zkoušení" hint="Např. písemka v jiný den, než se předmět učí" checked={outside} onChange={setOutside} name="outside" />
        </div>
      )}
      <label className="field">
        <span>Téma / látka</span>
        <input className="input" name="topic" maxLength={300} autoComplete="off" defaultValue={item.topic} />
      </label>
      <div className="field">
      <span>Druh</span>
      <div className="seg" role="group" aria-label="Druh">
        <button type="button" aria-pressed={!oral} onClick={() => setOral(false)}>Test</button>
        <button type="button" aria-pressed={oral} onClick={() => setOral(true)}>Zkoušení</button>
      </div>
      <input type="hidden" name="oral" value={oral ? "1" : ""} />
      </div>
      <div className="field">
        <SwitchRow label="Náhradní termín" hint="Píše ho jen ten, kdo původní termín nepsal" checked={makeup} onChange={setMakeup} name="makeup" value="1" />
      </div>
      <p className="hint" style={{ margin: "0 0 4px" }}>Když změníš datum, spolužáci dostanou zprávu.</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>Zrušit</button>
        <Submit disabled={blocked}>Uložit</Submit>
      </div>
    </ActionForm>
  );
}
