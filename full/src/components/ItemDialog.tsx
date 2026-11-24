"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { dayName, dayShort, schoolYearEnd } from "@/lib/dates";
import { SwitchRow } from "./SwitchRow";
import { ActionForm, Submit } from "./forms";
import type { ActionState } from "@/lib/action";

export type SubjectOption = { id: number; name: string; /** dny v týdnu (1–5), kdy se předmět podle stálého rozvrhu učí */ days: number[]; groups: { id: number; label: string; whole: boolean }[] };

/** Dialog „Nový úkol“ / „Nový test nebo zkoušení“. Možnosti „Pro koho“ se řídí vybraným předmětem. */
export function ItemDialog({
  kind,
  subjects,
  action,
  today,
  autoOpen = false,
  allowNone = false,
  emptyHint,
  defaultDate,
}: {
  kind: "task" | "test";
  subjects: SubjectOption[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  today: string;
  autoOpen?: boolean;
  /** úkol může být bez předmětu */
  allowNone?: boolean;
  /** vysvětlení, proč nejde nic přidat, když nejsou žádné předměty */
  emptyHint?: string;
  /** předvyplněné datum (např. z kalendáře) */
  defaultDate?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [subjectId, setSubjectId] = useState<number | "">(allowNone ? "" : subjects[0]?.id ?? "");
  const subject = subjects.find((s) => s.id === subjectId);
  const [date, setDate] = useState(defaultDate ?? today);
  const dow = date ? ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1 : 0;
  const [outside, setOutside] = useState(false);
  const offDay = kind === "test" && !!subject && !!date && !subject.days.includes(dow);
  const weekend = dow > 5;
  const notTaught = offDay && (weekend || !outside);
  const [repeat, setRepeat] = useState(false);
  const [priv, setPriv] = useState(false);
  const [makeup, setMakeup] = useState(false);
  const [oral, setOral] = useState(false);
  const [until, setUntil] = useState("");
  const special = subject?.groups.find((g) => !g.whole);
  const scopeLabel = priv ? "Jen já (spolužáci to neuvidí)" : special ? `Jen moje skupina: ${special.label}` : "Celá třída";
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!autoOpen || (!subjects.length && !allowNone)) return;
    ref.current?.showModal();
    router.replace(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  const noun = kind === "task" ? "úkol" : "test nebo zkoušení";

  return (
    <>
      <button data-new className="btn primary btn-new" onClick={() => ref.current?.showModal()} disabled={!subjects.length && !allowNone} title={!subjects.length && !allowNone ? emptyHint : undefined}>
        Nový {noun}
      </button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>Nový {noun}</h2>
          <ActionForm action={action} onSuccess={() => ref.current?.close()}>
            {kind === "task" && (
              <label className="field">
                <span>Co je potřeba udělat</span>
                <input className="input" name="title" required maxLength={200} autoComplete="off" />
              </label>
            )}
            <label className="field">
              <span>Předmět</span>
              <select className="select" name="subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value ? Number(e.target.value) : ""); setOutside(false); }}>
                {allowNone && <option value="">Bez předmětu</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Pro koho</span>
              <div className="scope-static">{scopeLabel}</div>
              <SwitchRow label="Jen pro mě" hint="Uvidíš to jen ty a spolužáci nedostanou zprávu" checked={priv} onChange={setPriv} name="private" value="1" />
            </div>
            <label className="field">
              <span>{kind === "task" ? "Termín" : "Datum"}</span>
              <input className="input" type="date" name={kind === "task" ? "due" : "date"} required={kind === "test"} value={kind === "test" ? date : undefined} onChange={kind === "test" ? (e) => { setDate(e.target.value); setUntil(""); setOutside(false); } : undefined} defaultValue={kind === "task" ? defaultDate : undefined} />
              {offDay && weekend && <p className="msg-error" role="alert" style={{ marginTop: 8 }}>Test ani zkoušení nejde zadat na víkend.</p>}
            </label>
            {offDay && !weekend && (
              <div className="field">
                <p className="hint" style={{ marginBottom: 4 }}>
                  {subject!.name} se v {dayName(dow).toLowerCase()} podle stálého rozvrhu neučí (učí se: {subject!.days.map((d) => dayShort(d)).join(", ")}).
                </p>
                <SwitchRow label="Tento den je opravdu test nebo zkoušení" hint="Např. písemka v jiný den, než se předmět učí" checked={outside} onChange={setOutside} name="outside" />
              </div>
            )}
            {kind === "test" && (
              <div className="field">
              <span>Druh</span>
              <div className="seg" role="group" aria-label="Druh">
                <button type="button" aria-pressed={!oral} onClick={() => setOral(false)}>Test</button>
                <button type="button" aria-pressed={oral} onClick={() => setOral(true)}>Zkoušení</button>
              </div>
              <input type="hidden" name="oral" value={oral ? "1" : ""} />
            </div>
            )}
            {kind === "test" && (
              <div className="field">
                <SwitchRow label="Náhradní termín" hint="Píše ho jen ten, kdo původní termín nepsal" checked={makeup} onChange={setMakeup} name="makeup" value="1" />
              </div>
            )}
            {kind === "test" && (
              <div className="field">
                <SwitchRow label="Opakovat každý týden" hint="Termín se vytvoří vždy ve stejný den v týdnu" checked={repeat} onChange={setRepeat} name="repeat" value="weekly" />
                {repeat && (
                  <label className="repeat-until">
                    <span>Opakovat do</span>
                    <input className="input" type="date" name="until" value={until || (date ? schoolYearEnd(date) : "")} min={date} onChange={(e) => setUntil(e.target.value)} />
                    <small>Výchozí je konec školního roku (30. 6.).</small>
                  </label>
                )}
              </div>
            )}
            {kind === "task" ? (
              <label className="field">
                <span>Poznámka</span>
                <textarea className="textarea" name="note" maxLength={2000} rows={4} />
              </label>
            ) : (
              <label className="field">
                <span>Téma / látka</span>
                <input className="input" name="topic" maxLength={300} placeholder="např. Kvadratické rovnice" autoComplete="off" />
              </label>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>
                Zrušit
              </button>
              <Submit disabled={notTaught}>Uložit</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
