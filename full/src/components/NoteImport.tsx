"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** Nahrání souboru (.docx, .md, .txt) jako nové poznámky. Můžeš soubor vybrat, nebo ho přetáhnout na tlačítko. */
export function NoteImport({ subject }: { subject?: number | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const send = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length || busy) return;
    setBusy(true);
    setError("");
    let last = 0;
    const failed: string[] = [];
    for (const f of list.slice(0, 10)) {
      const r = await fetch("/poznamky/import", { method: "POST", headers: { "x-name": encodeURIComponent(f.name), ...(subject ? { "x-subject": String(subject) } : {}) }, body: f })
        .then(async (res) => ({ ok: res.ok, ...((await res.json().catch(() => ({}))) as { id?: number; error?: string }) }))
        .catch(() => ({ ok: false, id: 0, error: "Spojení se nepovedlo." }));
      if (r.ok && r.id) last = r.id;
      else failed.push(`${f.name}: ${r.error ?? "nepovedlo se"}`);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (failed.length) setError(failed.join(" "));
    if (last && !failed.length && list.length === 1) router.push(`/poznamky/${last}`);
    else if (last) router.refresh();
  };

  return (
    <div className="note-import">
      <button
        type="button"
        className={`btn${over ? " over" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files); }}
        title="Nahrát soubor Word (.docx), Markdown (.md) nebo text (.txt) jako poznámku"
      >
        <Icon name="download" size={16} />{busy ? "Nahrávám…" : "Nahrát soubor"}
      </button>
      <input ref={input} type="file" hidden multiple accept=".docx,.md,.markdown,.txt" onChange={(e) => e.target.files && void send(e.target.files)} />
      {error && <p className="msg-error" role="alert">{error}</p>}
    </div>
  );
}
