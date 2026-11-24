"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type FileItem = { id: number; user_id: number; name: string; mime: string; size: number; created_at: number };

const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const OPENS_INLINE = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

function Row({ noteId, item, canManage, onDelete, onRename }: { noteId: number; item: FileItem; canManage: boolean; onDelete: (id: number) => void; onRename: (id: number, name: string) => void }) {
  const [busy, setBusy] = useState(false);
  const src = `/poznamky/${noteId}/priloha/${item.id}`;
  const rename = async () => {
    const v = window.prompt("Nový název přílohy", item.name);
    if (!v || v.trim() === item.name) return;
    const r = await fetch(src, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
    if (r.ok) onRename(item.id, ((await r.json()) as { name: string }).name);
  };
  const remove = async () => {
    if (!window.confirm(`Smazat přílohu „${item.name}“? Nejde to vrátit.`)) return;
    setBusy(true);
    const r = await fetch(src, { method: "DELETE" });
    if (r.ok) onDelete(item.id);
    else setBusy(false);
  };
  return (
    <div className="file-row">
      <span className="file-ico"><Icon name="file" size={18} /></span>
      <div className="file-main">
        <a href={src} target={OPENS_INLINE(item.mime) ? "_blank" : undefined} rel="noopener" download={OPENS_INLINE(item.mime) ? undefined : item.name} className="file-name">{item.name}</a>
        <span className="audio-meta">{mb(item.size)}</span>
      </div>
      <div className="file-actions">
        {OPENS_INLINE(item.mime) && <a className="btn small" href={`${src}?stahnout=1`} download={item.name}>Stáhnout</a>}
        {canManage && (
          <>
            <button type="button" className="btn small" onClick={rename} disabled={busy}>Přejmenovat</button>
            <button type="button" className="icon-btn" aria-label="Smazat přílohu" title="Smazat" disabled={busy} onClick={remove}><Icon name="trash" size={16} /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Přílohy poznámky (PDF pracovní listy, dokumenty, obrázky). Přidávat smí autor a pozvaní, vidí je všichni, kdo poznámku čtou. */
export function NoteFiles({ noteId, initial, canAdd, meId, ownerId, accept }: { noteId: number; initial: FileItem[]; canAdd: boolean; meId: number; ownerId: number; accept: string }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setItems(initial), [initial]);

  const upload = (f: File) =>
    new Promise<void>((resolve) => {
      setError("");
      setProgress(0);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/poznamky/${noteId}/priloha`);
      xhr.setRequestHeader("X-Name", encodeURIComponent(f.name));
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
      xhr.onload = () => {
        setProgress(null);
        try {
          const body = JSON.parse(xhr.responseText);
          if (xhr.status === 201) setItems((l) => [...l, body]);
          else setError(`${f.name}: ${body.error ?? "Nahrání se nepovedlo."}`);
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
      xhr.send(f);
    });
  const pick = async (files: FileList | File[] | null) => {
    for (const f of Array.from(files ?? [])) await upload(f);
    if (input.current) input.current.value = "";
  };

  if (!canAdd && !items.length) return null;
  const busy = progress !== null;
  return (
    <section className={`audio note-files${drag ? " drag" : ""}`} aria-label="Přílohy"
      onDragOver={canAdd ? (e) => (e.preventDefault(), setDrag(true)) : undefined}
      onDragLeave={() => setDrag(false)}
      onDrop={canAdd ? (e) => (e.preventDefault(), setDrag(false), void pick(e.dataTransfer.files)) : undefined}
    >
      <div className="audio-bar">
        <h2 className="section">Přílohy</h2>
        {canAdd && (
          <div className="btn-row">
            <button type="button" className="btn small" onClick={() => input.current?.click()} disabled={busy}>Přidat přílohu</button>
            <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => void pick(e.target.files)} />
          </div>
        )}
      </div>
      {busy && (
        <div className="audio-progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label="Nahrávání přílohy">
          <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          <span>{progress === 1 ? "Zpracovávám…" : `Nahrávám ${Math.round((progress ?? 0) * 100)} %`}</span>
        </div>
      )}
      {error && <p className="msg-error" role="alert">{error}</p>}
      {items.length ? (
        <div className="card rows">
          {items.map((f) => (
            <Row key={f.id} noteId={noteId} item={f} canManage={f.user_id === meId || ownerId === meId} onDelete={(id) => setItems((l) => l.filter((x) => x.id !== id))} onRename={(id, name) => setItems((l) => l.map((x) => (x.id === id ? { ...x, name } : x)))} />
          ))}
        </div>
      ) : (
        <p className="hint audio-empty">Přidej třeba PDF pracovní list, dokument nebo obrázek. Soubor sem můžeš i přetáhnout. Vidí ho každý, kdo poznámku čte.</p>
      )}
    </section>
  );
}
