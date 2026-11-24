"use client";

import { useMemo, useRef, useState } from "react";
import { sendAnnouncement } from "@/app/actions/admin";
import { ActionForm, Submit } from "./forms";

type Cls = { id: number; name: string; users: number };
type Usr = { id: number; name: string; class: string };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Oznámení od správce: všem, vybraným třídám, nebo konkrétním lidem (zvonek a push). */
export function AnnounceDialog({ classes, users, mailOn }: { classes: Cls[]; users: Usr[]; mailOn: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"all" | "classes" | "users">("all");
  const [cls, setCls] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [silent, setSilent] = useState(false);
  const [email, setEmail] = useState(false);
  const [when, setWhen] = useState("");
  const shown = useMemo(() => {
    const n = fold(q);
    return users.filter((u) => !picked.includes(u.id) && (!n || fold(`${u.name} ${u.class}`).includes(n))).slice(0, 8);
  }, [users, picked, q]);
  const by = new Map(users.map((u) => [u.id, u]));
  const count = kind === "all" ? users.length : kind === "classes" ? classes.filter((c) => cls.includes(c.id)).reduce((n, c) => n + c.users, 0) : picked.length;

  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>Poslat oznámení</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>Poslat nebo naplánovat oznámení</h2>
          <ActionForm action={sendAnnouncement} resetOnSuccess={false} onSuccess={() => setTimeout(() => ref.current?.close(), 1400)}>
            <div className="field"><span>Komu</span>
              <div className="seg" role="radiogroup" aria-label="Komu">
                {([["all", "Všem"], ["classes", "Třídám"], ["users", "Lidem"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
                ))}
              </div>
              <input type="hidden" name="audience" value={kind} />
            </div>

            {kind === "classes" && (
              <div className="field"><span>Třídy</span>
                <div className="announce-list">
                  {classes.map((c) => (
                    <label key={c.id} className="cmp-check">
                      <input type="checkbox" name="class" value={c.id} checked={cls.includes(c.id)} onChange={(e) => setCls((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
                      {c.name} <small style={{ color: "var(--muted)" }}>({c.users})</small>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {kind === "users" && (
              <div className="field"><span>Lidé</span>
                <div className="cmp-picker">
                  {picked.length > 0 && (
                    <div className="cmp-chips">
                      {picked.map((id) => (
                        <span key={id} className="cmp-chip">{by.get(id)?.name}<button type="button" onClick={() => setPicked((l) => l.filter((x) => x !== id))} aria-label={`Odebrat ${by.get(id)?.name}`}>×</button><input type="hidden" name="user" value={id} /></span>
                      ))}
                    </div>
                  )}
                  <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledej podle jména nebo třídy…" aria-label="Hledat člověka" autoComplete="off" />
                  {q && shown.length > 0 && (
                    <ul className="cmp-list" style={{ position: "static", marginTop: 6 }}>
                      {shown.map((u) => <li key={u.id}><button type="button" onClick={() => { setPicked((l) => [...l, u.id]); setQ(""); }}>{u.name} <small style={{ color: "var(--muted)" }}>· {u.class}</small></button></li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <label className="field"><span>Nadpis</span><input className="input" name="title" required minLength={2} maxLength={120} autoComplete="off" /></label>
            <label className="field"><span>Text (nepovinný)</span><textarea className="textarea" name="body" rows={4} maxLength={500} /></label>
            <label className="field"><span>Odkaz po kliknutí (nepovinný)</span><input className="input" name="link" placeholder="/testy-a-zkouseni" maxLength={200} autoComplete="off" /></label>
            <label className="cmp-check"><input type="checkbox" name="silent" value="1" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Tiché oznámení (jen do zvonečku, bez upozornění na zařízení ani e-mailu)</label>
            <label className="cmp-check"><input type="checkbox" name="email" value="1" checked={email} disabled={!mailOn} onChange={(e) => setEmail(e.target.checked)} /> Poslat také e-mailem (každému příjemci, i když má e-mailová upozornění vypnutá){!mailOn ? " – server zatím nemá nastavené SMTP" : ""}</label>
            <label className="field"><span>Odeslat v čase (nepovinné, prázdné = hned)</span><input className="input" type="datetime-local" name="when" value={when} onChange={(e) => setWhen(e.target.value)} /><small className="hint" style={{ margin: 0 }}>Čas je podle hodin v Česku. Naplánované oznámení jde do odeslání zrušit ve Správě.</small></label>
            <p className="hint" style={{ margin: 0 }}>{silent ? "Objeví se jen ve zvonečku v aplikaci, nic nezavibruje ani nezazvoní." : "Přijde do zvonečku a jako upozornění na zařízení, kde je mají lidé zapnutá."} Dostane to {count} {count === 1 ? "člověk" : count >= 2 && count <= 4 ? "lidé" : "lidí"}.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button>
              <Submit pendingText="Odesílám…" disabled={count === 0}>{when ? "Naplánovat" : "Odeslat"}</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
