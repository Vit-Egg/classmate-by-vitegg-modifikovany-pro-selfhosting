"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { NoteSaveContext } from "@/lib/note-save";
import { saveNoteRating } from "@/app/actions/notes";
import { savePref } from "@/app/actions/settings";
import type { Reflection } from "@/lib/reflection";

const UNDERSTAND = [
  ["😵", "Vůbec jsem to nepochopil(a)"],
  ["😕", "Pochopil(a) jsem jen část"],
  ["😐", "Docela ušlo"],
  ["🙂", "Chápu to dobře"],
  ["🤩", "Chápu to skvěle"],
] as const;
const FOCUS = [
  ["😴", "Vůbec jsem se nesoustředil(a)"],
  ["🥱", "Soustředění mi kolísalo"],
  ["😐", "Průměrné soustředění"],
  ["🙂", "Soustředil(a) jsem se dobře"],
  ["🎯", "Naprosto soustředěný(á)"],
] as const;

function Faces({ title, options, value, onValue }: { title: string; options: readonly (readonly [string, string])[]; value: number | null; onValue: (v: number | null) => void }) {
  return (
    <div className="rate-group">
      <span className="rate-name">{title}</span>
      <div className="rating-faces" role="radiogroup" aria-label={title}>
        {options.map(([face, label], i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i + 1} aria-label={label} title={label} className={`face${value === i + 1 ? " on" : ""}`} onClick={() => onValue(value === i + 1 ? null : i + 1)}>
            {face}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Moje hodnocení poznámky: jak jsem látku pochopil(a) a jak jsem se soustředil(a), smajlíkem i komentářem. Vidím ho jen já, ukládá se samo. */
export function NoteRating({ noteId, initial, shown: shownInitial = true }: { noteId: number; initial: Reflection; /** je hodnocení rozbalené (volba se pamatuje u účtu) */ shown?: boolean }) {
  const [r, setR] = useState(initial);
  const [shown, setShown] = useState(shownInitial);
  const toggle = () => {
    const next = !shown;
    setShown(next);
    void savePref("note_rating", next ? "1" : "0").catch(() => {});
  };
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notes, setNotes] = useState(!!(initial.understanding_note || initial.focus_note));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const latest = useRef(r);
  latest.current = r;
  // v editoru poznámky se stav hodnocení ukazuje společně s celou poznámkou (nahoře) a ukládá se spolu s ní
  const unified = useContext(NoteSaveContext);
  const unifiedRef = useRef(unified);
  unifiedRef.current = unified;
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);

  const send = async (): Promise<void> => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    setState("saving");
    unifiedRef.current?.report("saving");
    try {
      const res = await saveNoteRating(noteId, latest.current);
      setState(res.ok ? "saved" : "error");
      if (res.ok) {
        tries.current = 0;
        unifiedRef.current?.report("saved");
        return;
      }
    } catch {
      setState("error");
    }
    unifiedRef.current?.report("error");
    // po chybě se zkouší znovu s rostoucím odstupem
    retry.current = setTimeout(() => void send(), Math.min(30_000, 3_000 * 2 ** tries.current++));
  };

  // editor může hodnocení uložit hned (tlačítko Uložit, Ctrl+S, odchod ze stránky)
  useEffect(() => {
    if (!unified) return;
    unified.register(async () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        await send();
      } else if (retry.current) await send();
    });
    return () => unified.register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unified]);
  useEffect(() => () => void (retry.current && clearTimeout(retry.current)), []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    unifiedRef.current?.report("dirty");
    timer.current = setTimeout(() => {
      timer.current = null;
      void send();
    }, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  // před odchodem se hodnocení odešle hned
  useEffect(() => {
    const leave = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void send();
      }
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rated = r.understanding != null || r.focus != null;
  const stateText = state === "saving" ? "Ukládám…" : state === "saved" && shown ? "Uloženo" : state === "error" ? "Nepovedlo se uložit" : "";

  // Jedna a ta samá stavba v obou režimech: místo pro průběh hodiny (#note-bell-slot) se při skrytí a zobrazení hodnocení nepřekreslí,
  // takže průběh hodiny ve fullscreenu nezmizí.
  return (
    <div className={`rating-strip${shown ? "" : " collapsed"}`} aria-label="Moje hodnocení poznámky">
      <div className="rating-row">
        {shown ? (
          <>
            <span className="rate-title">Moje hodnocení</span>
            <Faces title="Chápání" options={UNDERSTAND} value={r.understanding} onValue={(v) => setR((x) => ({ ...x, understanding: v }))} />
            <Faces title="Soustředění" options={FOCUS} value={r.focus} onValue={(v) => setR((x) => ({ ...x, focus: v }))} />
            <button type="button" className={`rate-notes-btn${notes ? " on" : ""}`} aria-expanded={notes} onClick={() => setNotes(!notes)}>
              {notes ? "Skrýt komentáře" : r.understanding_note || r.focus_note ? "Komentáře" : "+ Komentář"}
            </button>
          </>
        ) : (
          <button type="button" className="rate-notes-btn" aria-expanded={false} onClick={toggle}>
            Zobrazit hodnocení hodiny{rated ? ` · ${r.understanding != null ? UNDERSTAND[r.understanding - 1][0] : ""}${r.focus != null ? FOCUS[r.focus - 1][0] : ""}` : ""}
          </button>
        )}
        <div className="rating-right">
          {!unified && <span className="rating-state" role="status">{stateText}</span>}
          {shown && <button type="button" className="rate-notes-btn" aria-expanded onClick={toggle} title="Skrýt hodnocení hodiny (obnovíš ho tlačítkem na stejném místě)">Skrýt</button>}
          {/* sem se při celé obrazovce vykreslí průběh hodiny (FullscreenBell) */}
          <span id="note-bell-slot" className="rating-bell-slot" />
        </div>
      </div>
      {shown && notes && (
        <div className="rating-notes">
          <textarea className="textarea" rows={2} maxLength={500} value={r.understanding_note} placeholder="Chápání: co mi nejde, co zopakovat…" onChange={(e) => setR((x) => ({ ...x, understanding_note: e.target.value }))} aria-label="Chápání: komentář" />
          <textarea className="textarea" rows={2} maxLength={500} value={r.focus_note} placeholder="Soustředění: co mě rušilo, kdy mi to šlo…" onChange={(e) => setR((x) => ({ ...x, focus_note: e.target.value }))} aria-label="Soustředění: komentář" />
        </div>
      )}
    </div>
  );
}
