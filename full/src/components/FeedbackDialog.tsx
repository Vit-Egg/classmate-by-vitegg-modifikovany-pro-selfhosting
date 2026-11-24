"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { shrinkImage } from "@/lib/image-upload";
import { Icon } from "./Icon";

const KINDS = [
  ["napad", "Mám nápad na vylepšení"],
  ["bug", "Našel jsem chybu"],
  ["otazka", "Mám otázku"],
  ["jine", "Něco jiného"],
  ["nahlasit", "Nahlásit nevhodný obsah"],
] as const;

/** Okno „Mám nápad“ (zpětná vazba správci téhle instance). Otevírá se událostí classmate:feedback z postranního panelu, palety a Nastavení. */
export function FeedbackDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("napad");
  const path = usePathname();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prefill, setPrefill] = useState("");
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[]) => {
    setError("");
    setFiles((cur) => {
      const next = [...cur, ...Array.from(list)].slice(0, 4);
      if (cur.length + Array.from(list).length > 4) setError("Příloh může být nejvýš čtyři.");
      return next;
    });
  };
  const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1048576).toFixed(1).replace(".", ",")} MB`);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData(form);
      fd.delete("files");
      for (const f of files) fd.append("files", await shrinkImage(f), f.name);
      const r = await fetch("/api/feedback", { method: "POST", body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Zprávu se nepodařilo odeslat.");
      setDone(true);
      setTimeout(() => ref.current?.close(), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zprávu se nepodařilo odeslat.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<string | { kind: string; text?: string }>).detail;
      const k = typeof d === "string" ? d : d?.kind;
      if (k) setKind(k);
      setPrefill(typeof d === "object" && d?.text ? d.text : "");
      setFiles([]);
      setError("");
      setDone(false);
      setOpen(true);
    };
    window.addEventListener("classmate:feedback", on);
    return () => window.removeEventListener("classmate:feedback", on);
  }, []);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className="modal" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="modal-card">
        <h2>Zpětná vazba</h2>
        <p className="hint" style={{ margin: "-8px 0 16px" }}>Napiš správci aplikace. Odpověď ti přijde na e-mail.</p>
        <form onSubmit={submit} className="form">
          <input type="hidden" name="page" value={path} />
          <div className="field">
            <span>O co jde</span>
            <div className="seg wrap" role="group" aria-label="Typ zprávy">
              {KINDS.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>
          <label className="field">
            <span>{kind === "bug" ? "Co se stalo a co jsi čekal" : kind === "napad" ? "Jaký máš nápad" : kind === "nahlasit" ? "Co je na obsahu nevhodné" : "Zpráva"}</span>
            <textarea key={prefill} defaultValue={prefill} className="textarea" name="message" onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); addFiles(imgs.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `screenshot-${Date.now()}-${i}.png`, { type: f.type }))); } }} rows={6} maxLength={4000} required autoFocus placeholder={kind === "bug" ? "Na jaké stránce, co jsi udělal, co se stalo…" : "Napiš, co máš na srdci…"} />
          </label>
          <div className="field">
            <span>Fotky a přílohy <i style={{ fontWeight: 400, color: "var(--muted)" }}>(nepovinné)</i></span>
            <input ref={input} type="file" name="files" accept="image/*,application/pdf,text/plain" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            <div className="fb-files">
              {files.map((f, i) => (
                <span key={`${f.name}${i}`} className="fb-file">
                  <Icon name={f.type.startsWith("image/") ? "file" : "file"} size={14} />
                  <span className="fb-name">{f.name}</span>
                  <small>{size(f.size)}</small>
                  <button type="button" aria-label={`Odebrat ${f.name}`} onClick={() => setFiles((l) => l.filter((_, k) => k !== i))}>×</button>
                </span>
              ))}
              {files.length < 4 && <button type="button" className="btn small" onClick={() => input.current?.click()}>+ Přidat fotku nebo soubor</button>}
            </div>
            <p className="hint" style={{ margin: 0 }}>Až čtyři soubory (obrázek, PDF nebo text), každý do 8 MB. Screenshot jde i vložit z clipboardu do zprávy.</p>
          </div>
          <label className="check-row">
            <input type="checkbox" name="tech" value="1" defaultChecked /> Přiložit technické údaje (stránka, verze aplikace, prohlížeč)
          </label>
          {error && <p className="msg-error" role="alert">{error}</p>}
          {done && <p className="msg-ok" role="status">Děkuji, zpráva je odeslaná.</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button>
            <button type="submit" className="btn primary" disabled={busy || done}>{busy ? "Odesílám…" : "Odeslat"}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
