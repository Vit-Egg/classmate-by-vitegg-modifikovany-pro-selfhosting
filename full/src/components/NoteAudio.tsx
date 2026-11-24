"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { setNoteTarget, startRecording, useRecorder } from "@/lib/recorder";
import { RemindToggle } from "./RecordPrompt";

export type AudioItem = { id: number; name: string; mime: string; size: number; duration: number | null; created_at: number };

const clock = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const whenOf = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);

/** Chrome ukládá nahrávky z MediaRecorderu bez délky, takže by nešlo přetáčet. Tohle ji donutí délku zjistit. */
function fixDuration(el: HTMLAudioElement) {
  if (el.duration !== Infinity) return;
  const back = () => {
    el.removeEventListener("timeupdate", back);
    el.currentTime = 0;
  };
  el.addEventListener("timeupdate", back);
  el.currentTime = 1e101;
}

function Row({ noteId, item, readOnly, onDelete, onRename }: { noteId: number; item: AudioItem; readOnly: boolean; onDelete: (id: number) => void; onRename: (id: number, name: string) => void }) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const src = `/poznamky/${noteId}/audio/${item.id}`;

  const save = async () => {
    const v = name.trim();
    if (!v || v === item.name) return void setName(item.name);
    const r = await fetch(src, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
    if (r.ok) onRename(item.id, v);
    else setName(item.name);
  };
  const remove = async () => {
    if (!window.confirm(`Smazat nahrávku „${item.name}“? Nejde to vrátit.`)) return;
    setBusy(true);
    const r = await fetch(src, { method: "DELETE" });
    if (r.ok) onDelete(item.id);
    else setBusy(false);
  };

  return (
    <div className="audio-row">
      <div className="audio-head">
        {readOnly ? <b>{item.name}</b> : <input className="audio-name" value={name} maxLength={120} aria-label="Název nahrávky" onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />}
        <span className="audio-meta">{[whenOf(item.created_at), item.duration ? clock(item.duration) : "", mb(item.size)].filter(Boolean).join(" · ")}</span>
        {!readOnly && (
          <button type="button" className="icon-btn" aria-label="Smazat nahrávku" title="Smazat" disabled={busy} onClick={remove}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      <audio controls preload="metadata" src={src} onLoadedMetadata={(e) => fixDuration(e.currentTarget)} />
    </div>
  );
}

/** Nahrávky z hodin u poznámky: nahrávání přímo v aplikaci (řídí ho lib/recorder a plovoucí panel, takže nahrávka přežije přechod na jinou stránku), nahrání souboru a přehrávání. */
export function NoteAudio({ noteId, title = "", initial, readOnly = false, fresh = false }: { noteId: number; title?: string; initial: AudioItem[]; readOnly?: boolean; /** poznámka je teprve vytvořená (jen u té se na začátku hodiny nabízí nahrávání) */ fresh?: boolean }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRecorder();
  const mine = rec.status !== "idle" && rec.noteId === noteId;
  const elsewhere = rec.status !== "idle" && !mine;
  // až v prohlížeči, ať se server a klient při vykreslení neliší
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => setCanRecord("MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia), []);
  // právě vytvořená poznámka: na začátku hodiny se přes ni nabídne nahrávání (RecordPrompt)
  useEffect(() => {
    if (readOnly || !fresh) return;
    setNoteTarget({ noteId, title });
    return () => setNoteTarget(null);
  }, [noteId, title, readOnly, fresh]);

  // seznam ze serveru (po obnovení stránky) a nově uložená nahrávka z panelu
  useEffect(() => setItems(initial), [initial]);
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ noteId: number; item: AudioItem | null }>).detail;
      if (d?.noteId === noteId && d.item) setItems((l) => (l.some((x) => x.id === d.item!.id) ? l : [...l, d.item!]));
    };
    window.addEventListener("classmate:audio-saved", onSaved);
    return () => window.removeEventListener("classmate:audio-saved", onSaved);
  }, [noteId]);

  const upload = useCallback(
    (blob: Blob, name: string, duration: number | null) =>
      new Promise<void>((resolve) => {
        setError("");
        setProgress(0);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/poznamky/${noteId}/audio`);
        xhr.setRequestHeader("X-Name", encodeURIComponent(name));
        if (duration) xhr.setRequestHeader("X-Duration", String(duration));
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
        xhr.onload = () => {
          setProgress(null);
          try {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status === 201) setItems((l) => [...l, body]);
            else setError(body.error ?? "Nahrání se nepovedlo.");
          } catch {
            setError(xhr.status === 413 ? "Soubor je moc velký." : "Nahrání se nepovedlo.");
          }
          resolve();
        };
        xhr.onerror = () => {
          setProgress(null);
          setError("Nahrání se nepovedlo, zkontroluj připojení.");
          resolve();
        };
        xhr.send(blob);
      }),
    [noteId],
  );

  const pick = async (files: FileList | File[] | null) => {
    for (const f of Array.from(files ?? [])) {
      const base = f.name.replace(/\.[^.]+$/, "") || "Nahrávka";
      const duration = await new Promise<number | null>((res) => {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
        a.onerror = () => res(null);
        a.src = URL.createObjectURL(f);
      });
      await upload(f, base, duration);
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  if (readOnly && !items.length) return null;
  const busy = progress !== null;

  return (
    <section className={`audio${drag ? " drag" : ""}`} aria-label="Nahrávky z hodin"
      onDragOver={readOnly ? undefined : (e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={readOnly ? undefined : (e) => (e.preventDefault(), setDrag(false), void pick(e.dataTransfer.files))}
    >
      <div className="audio-bar">
        <h2 className="section">Nahrávky</h2>
        {!readOnly && !mine && (
          <div className="btn-row">
            {canRecord && <button type="button" className="btn small rec-btn" onClick={() => void startRecording(noteId, title)} disabled={busy || elsewhere} title={elsewhere ? "Právě se nahrává do jiné poznámky" : undefined}><i className="rec-dot" /> Nahrát</button>}
            <button type="button" className="btn small" onClick={() => fileInput.current?.click()} disabled={busy}>Nahrát soubor</button>
            <input ref={fileInput} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.oga,.webm,.flac,.aac" multiple hidden onChange={(e) => void pick(e.target.files)} />
          </div>
        )}
      </div>

      {!readOnly && canRecord && !mine && <div style={{ margin: "-4px 0 10px" }}><RemindToggle /></div>}
      {mine && <p className="hint rec-note">Do téhle poznámky se právě nahrává. Nahrávku ovládáš v panelu dole, nahrávání neskončí, ani když přejdeš na jinou stránku.</p>}
      {busy && (
        <div className="audio-progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label="Nahrávání souboru">
          <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          <span>{progress === 1 ? "Zpracovávám…" : `Nahrávám ${Math.round((progress ?? 0) * 100)} %`}</span>
        </div>
      )}
      {error && <p className="msg-error" role="alert">{error}</p>}

      {items.length ? (
        <div className="card rows">
          {items.map((a) => (
            <Row key={a.id} noteId={noteId} item={a} readOnly={readOnly} onDelete={(id) => setItems((l) => l.filter((x) => x.id !== id))} onRename={(id, name) => setItems((l) => l.map((x) => (x.id === id ? { ...x, name } : x)))} />
          ))}
        </div>
      ) : (
        !mine && <p className="hint audio-empty">Nahraj hodinu přímo tady, nebo sem přetáhni zvukový soubor. Nahrávku si pak můžeš kdykoli přehrát u poznámky.</p>
      )}
    </section>
  );
}
