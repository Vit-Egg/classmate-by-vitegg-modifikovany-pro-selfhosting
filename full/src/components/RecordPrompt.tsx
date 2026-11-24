"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pragueClock, pragueNow } from "@/lib/dates";
import { startRecording, setRemind, useNoteTarget, useRecorder, useRemind } from "@/lib/recorder";
import { tickAligned } from "@/lib/ticker";
import type { Slot } from "@/lib/schedule";

/** Jak dlouho po zvonění se ještě nabízí nahrávání (minuty). Pozdě začínat nahrávat hodinu nedává smysl. */
const WINDOW = 10;

const doneKey = (s: Slot) => `rec-asked:${pragueNow().date}:${s.hour}`;
const asked = (s: Slot) => {
  try {
    return localStorage.getItem(doneKey(s)) === "1";
  } catch {
    return false;
  }
};
const markAsked = (s: Slot) => {
  try {
    localStorage.setItem(doneKey(s), "1");
  } catch {}
};

/**
 * Když si na začátku hodiny vytvoříš novou poznámku, zeptá se, jestli chceš hodinu nahrát do téhle poznámky (u starších poznámek se neptá).
 * Ptá se jednou za hodinu a jen v prvních minutách. Jde vypnout („Už se neptat“), zapnout zase u nahrávek v poznámce.
 */
export function RecordPrompt({ slots }: { slots: Slot[] }) {
  const note = useNoteTarget();
  const rec = useRecorder();
  const remind = useRemind();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    setCanRecord("MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia);
    const where = () => setHost(document.fullscreenElement ?? document.body);
    where();
    document.addEventListener("fullscreenchange", where);
    return () => document.removeEventListener("fullscreenchange", where);
  }, []);

  useEffect(() => {
    if (!note || !remind || !canRecord) return void setSlot(null);
    return tickAligned(() => {
      const now = pragueClock();
      const cur = slots.find((s) => !s.cancelled && !s.selfStudy && now >= s.begin && now < Math.min(s.end, s.begin + WINDOW));
      setSlot(cur && !asked(cur) ? cur : null);
    }, 5000);
  }, [note, remind, canRecord, slots]);

  if (!slot || !note || !host || rec.status !== "idle") return null;
  const close = () => (markAsked(slot), setSlot(null));

  return createPortal(
    <div className="rec-float" role="status" aria-live="polite">
      <div className="rec-pill ask">
        <i className="rec-dot" />
        <span className="rec-label"><b>Právě začala hodina: {slot.subject}.</b> Chceš ji nahrát do téhle poznámky?</span>
        <span className="rec-actions">
          <button type="button" className="btn small primary" onClick={() => (markAsked(slot), setSlot(null), void startRecording(note.noteId, note.title))}>Nahrát</button>
          <button type="button" className="btn small" onClick={close}>Teď ne</button>
          <button type="button" className="btn small" onClick={() => (setRemind(false), close())}>Už se neptat</button>
        </span>
      </div>
    </div>,
    host,
  );
}

/** Přepínač v sekci Nahrávky u poznámky: zapnout nebo vypnout připomínání nahrávání na začátku hodiny. */
export function RemindToggle() {
  const on = useRemind();
  return (
    <button type="button" className="btn small" onClick={() => setRemind(!on)} title="Na začátku hodiny se zeptá, jestli ji chceš nahrát">
      {on ? "Připomínat na začátku hodiny: ano" : "Připomínat na začátku hodiny: ne"}
    </button>
  );
}
