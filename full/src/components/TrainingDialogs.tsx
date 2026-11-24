"use client";

import { useRef } from "react";
import { saveEntryAction, saveReflectionAction } from "@/app/actions/denik";
import { ActionForm, Submit } from "./forms";

type EntryValues = { id?: number; date: string; type: string; minutes: number | ""; rpe: number | ""; content: string; goal: string; note: string };

/** Nový nebo upravený zápis aktivity (jedna řádka deníku). */
export function EntryDialog({ types, today, entry, label = "Nový zápis", small = false }: { types: readonly string[]; today: string; entry?: EntryValues; label?: string; small?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const e = entry ?? { date: today, type: "Trénink", minutes: "" as const, rpe: "" as const, content: "", goal: "", note: "" };
  return (
    <>
      <button type="button" className={small ? "icon-btn" : "btn primary"} aria-label={entry ? "Upravit zápis" : undefined} title={entry ? "Upravit" : undefined} onClick={() => ref.current?.showModal()}>
        {entry ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>
        ) : label}
      </button>
      <dialog ref={ref} className="modal" onClick={(ev) => ev.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>{entry ? "Upravit zápis" : "Nový zápis"}</h2>
          <ActionForm action={saveEntryAction} onSuccess={() => ref.current?.close()} resetOnSuccess={!entry}>
            {entry?.id && <input type="hidden" name="id" value={entry.id} />}
            <div className="tr-two">
              <label className="field"><span>Datum</span><input className="input" type="date" name="date" defaultValue={e.date} required /></label>
              <label className="field"><span>Typ aktivity</span>
                <select className="select" name="type" defaultValue={e.type}>{types.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
            </div>
            <div className="tr-two">
              <label className="field"><span>Délka (min)</span><input className="input" type="number" name="minutes" min={0} max={1440} inputMode="numeric" defaultValue={e.minutes} /></label>
              <label className="field"><span>Náročnost RPE (1–10)</span><input className="input" type="number" name="rpe" min={1} max={10} inputMode="numeric" defaultValue={e.rpe} placeholder="nepovinné" /></label>
            </div>
            <label className="field"><span>Konkrétní náplň aktivity</span><textarea className="textarea" name="content" rows={3} maxLength={1500} defaultValue={e.content} placeholder="např. poziční hra + 6×5 min hra, brankářský trénink…" /></label>
            <label className="field"><span>Cíl aktivity</span><input className="input" name="goal" maxLength={600} defaultValue={e.goal} placeholder="např. rychlé rozhodování při presinku" autoComplete="off" /></label>
            <label className="field"><span>Osobní zhodnocení / poznámka</span><textarea className="textarea" name="note" rows={3} maxLength={1500} defaultValue={e.note} placeholder="co se dařilo, co příště zlepšit" /></label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <Submit>Uložit</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}

type ReflValues = { id?: number; week: string; goal: string; achieved: string; improve: string; rating: number | "" };

/** Týdenní reflexe: týden se zadává libovolným dnem, dopočítá se pondělí až neděle. */
export function ReflectionDialog({ today, refl, small = false }: { today: string; refl?: ReflValues; small?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const r = refl ?? { week: today, goal: "", achieved: "", improve: "", rating: "" as const };
  return (
    <>
      <button type="button" className={small ? "icon-btn" : "btn primary"} aria-label={refl ? "Upravit reflexi" : undefined} title={refl ? "Upravit" : undefined} onClick={() => ref.current?.showModal()}>
        {refl ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>
        ) : "Nová reflexe"}
      </button>
      <dialog ref={ref} className="modal" onClick={(ev) => ev.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>{refl ? "Upravit reflexi" : "Týdenní reflexe"}</h2>
          <ActionForm action={saveReflectionAction} onSuccess={() => ref.current?.close()} resetOnSuccess={!refl}>
            {refl?.id && <input type="hidden" name="id" value={refl.id} />}
            <label className="field"><span>Kterého týdne (stačí jakýkoli den v něm)</span><input className="input" type="date" name="week" defaultValue={r.week} required /></label>
            <label className="field"><span>Cíl týdne</span><input className="input" name="goal" maxLength={600} defaultValue={r.goal} autoComplete="off" /></label>
            <label className="field"><span>Co se podařilo / posun</span><textarea className="textarea" name="achieved" rows={3} maxLength={1500} defaultValue={r.achieved} /></label>
            <label className="field"><span>Co zlepším příště</span><textarea className="textarea" name="improve" rows={3} maxLength={1500} defaultValue={r.improve} /></label>
            <label className="field"><span>Sebehodnocení (1–5)</span>
              <select className="select" name="rating" defaultValue={String(r.rating)}>
                <option value="">Neuvedeno</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <Submit>Uložit</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
