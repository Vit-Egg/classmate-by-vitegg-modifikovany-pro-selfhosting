"use client";

import { useRef, useState } from "react";
import { savePostAction } from "@/app/actions/nastenka";
import { ActionForm, Submit } from "./forms";
import { Icon } from "./Icon";
import { SwitchRow } from "./SwitchRow";

export type ComposeCat = { id: string; label: string; hint: string };
export type ComposePost = { id: number; category: string; title: string; body: string; link: string; expires: string; pinned: boolean; poll: boolean };

/** Dialog nového (nebo upravovaného) příspěvku na nástěnku. U úpravy ankety se možnosti nemění, protože by se pošpinily hlasy. */
export function BoardCompose({ cats, isAdmin, today, post, label, defaultCat, mailOn = false }: { cats: ComposeCat[]; isAdmin: boolean; today: string; /** server umí posílat e-maily */ mailOn?: boolean; post?: ComposePost; label?: string; defaultCat?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [cat, setCat] = useState(post?.category ?? defaultCat ?? cats[0].id);
  const [poll, setPoll] = useState(false);
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [notify, setNotify] = useState(false);
  const [email, setEmail] = useState(false);
  const [key, setKey] = useState(0);
  const editing = !!post;
  const hint = cats.find((c) => c.id === cat)?.hint;

  return (
    <>
      {editing ? (
        <button type="button" className="btn small" onClick={() => ref.current?.showModal()}>{label ?? "Upravit"}</button>
      ) : (
        <button type="button" className="btn primary" onClick={() => ref.current?.showModal()}><Icon name="plus" size={16} /> {label ?? "Nový příspěvek"}</button>
      )}
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card bd-compose">
          <h2>{editing ? "Upravit příspěvek" : "Nový příspěvek"}</h2>
          <ActionForm key={key} action={savePostAction} resetOnSuccess={!editing} onSuccess={() => { ref.current?.close(); if (!editing) { setKey((k) => k + 1); setPoll(false); setNotify(false); setEmail(false); setPinned(false); } }}>
            {post && <input type="hidden" name="id" value={post.id} />}
            <input type="hidden" name="category" value={cat} />
            <div className="field">
              <span>Téma</span>
              <div className="bd-cats" role="radiogroup" aria-label="Téma příspěvku">
                {cats.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={cat === c.id} className={`bd-cat bd-${c.id}${cat === c.id ? " on" : ""}`} onClick={() => setCat(c.id)}>{c.label}</button>
                ))}
              </div>
              {hint && <small className="hint" style={{ margin: "4px 0 0" }}>{hint}</small>}
            </div>
            <label className="field">
              <span>Nadpis</span>
              <input className="input" name="title" required maxLength={120} autoComplete="off" defaultValue={post?.title} placeholder={poll ? "Na co se ptáš?" : "O co jde?"} />
            </label>
            <label className="field">
              <span>Text <small>(nepovinné)</small></span>
              <textarea className="textarea" name="body" rows={5} maxLength={2000} defaultValue={post?.body} placeholder="Podrobnosti, kdy a kde, co s sebou…" />
            </label>
            <div className="time-row">
              <label className="field">
                <span>Odkaz <small>(nepovinné)</small></span>
                <input className="input" name="link" type="text" inputMode="url" maxLength={500} defaultValue={post?.link} placeholder="https://…" />
              </label>
              <label className="field">
                <span>Platí do <small>(nepovinné)</small></span>
                <input className="input" type="date" name="expires" min={today} defaultValue={post?.expires} />
              </label>
            </div>
            {!editing && (
              <>
                <SwitchRow label="Přidat anketu" hint="Spolužáci hlasují jednou volbou, hlas jde změnit" checked={poll} onChange={setPoll} name="poll" value="1" />
                {poll && (
                  <label className="field">
                    <span>Možnosti ankety <small>(jedna na řádek, 2 až 8)</small></span>
                    <textarea className="textarea" name="options" rows={4} maxLength={800} required placeholder={"Ano\nNe\nNevím"} />
                  </label>
                )}
                <SwitchRow label="Upozornit spolužáky" hint="Pošle jim zprávu do zvonečku. Používej jen u věcí, které opravdu spěchají" checked={notify} onChange={setNotify} name="notify" value="1" />
                {notify && mailOn && <SwitchRow label="Poslat i e-mailem" hint="Pro spolužáky, kteří Classmate moc nepoužívají. Dostanou e-mail s odkazem a mohou se z e-mailů z nástěnky odhlásit. Jde to nejvýš 2× za den" checked={email} onChange={setEmail} name="email" value="1" />}
              </>
            )}
            {isAdmin && <SwitchRow label="Připnout nahoru" hint="Zůstane nad ostatními příspěvky" checked={pinned} onChange={setPinned} name="pinned" value="1" />}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <Submit>{editing ? "Uložit" : "Zveřejnit"}</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
