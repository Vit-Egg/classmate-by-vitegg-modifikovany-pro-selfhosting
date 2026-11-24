"use client";

import { useState } from "react";
import { updateAiSettings } from "@/app/actions/admin";
import { ActionForm, Submit } from "./forms";

type Row = { uid: number; id?: string; value: string; note: string; isNew?: boolean };
type Props = { models: { name: string; note: string }[]; keys: { id: string; last4: string; note: string }[] };

const Svg = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

let seq = 0;

/** Seznam s poznámkou u každé položky, řazením šipkami a červeným křížkem na odebrání. Použité pro modely i API klíče. */
function ListEditor({ rows, setRows, mono, placeholder, addLabel, addPlaceholder }: { rows: Row[]; setRows: (r: Row[]) => void; mono?: boolean; placeholder?: string; addLabel: string; addPlaceholder: string }) {
  const [draft, setDraft] = useState("");
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const add = () => {
    const items = draft.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!items.length) return;
    setRows([...rows, ...items.filter((v) => !rows.some((r) => r.value === v)).map((value) => ({ uid: ++seq, value, note: "", isNew: true }))]);
    setDraft("");
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.uid} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
          <span className="hint" style={{ width: 18, textAlign: "center", margin: 0 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
            <code style={{ fontFamily: mono ? "var(--mono, monospace)" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{r.value}{r.isNew && <span className="hint"> (nový)</span>}</code>
            {placeholder && <input className="input" style={{ padding: "6px 10px", fontSize: 13 }} value={r.note} maxLength={120} placeholder={placeholder} onChange={(e) => patch(i, { note: e.target.value })} aria-label="Komentář" />}
          </div>
          <div className="btn-row" style={{ gap: 0, flexWrap: "nowrap" }}>
            <button type="button" className="icon-btn" style={{ color: "var(--muted)" }} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Posunout výš" title="Výš"><Svg d="m6 15 6-6 6 6" /></button>
            <button type="button" className="icon-btn" style={{ color: "var(--muted)" }} onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Posunout níž" title="Níž"><Svg d="m6 9 6 6 6-6" /></button>
            <button type="button" className="icon-btn" style={{ color: "var(--danger)" }} onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Odebrat" title="Odebrat"><Svg d="M18 6 6 18M6 6l12 12" /></button>
          </div>
        </div>
      ))}
      <div className="btn-row" style={{ flexWrap: "nowrap" }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={draft} placeholder={addPlaceholder} autoComplete="off" spellCheck={false} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add}>{addLabel}</button>
      </div>
    </div>
  );
}

/** Nastavení umělé inteligence pro celou aplikaci: pořadí modelů a API klíče Google AI. Změny se projeví po uložení. */
export function AiSettingsForm({ models, keys }: Props) {
  const [m, setM] = useState<Row[]>(() => models.map((x) => ({ uid: ++seq, value: x.name, note: "" })));
  const [k, setK] = useState<Row[]>(() => keys.map((x) => ({ uid: ++seq, id: x.id, value: `…${x.last4}`, note: x.note })));
  const payload = JSON.stringify({
    models: m.map((r) => ({ name: r.value, note: r.note })),
    keys: k.map((r) => (r.id ? { id: r.id, note: r.note } : { key: r.value, note: r.note })),
  });
  return (
    <ActionForm action={updateAiSettings} resetOnSuccess={false}>
      <input type="hidden" name="data" value={payload} />
      <div className="field">
        <span>Modely ({m.length})</span>
        <ListEditor rows={m} setRows={setM} mono addLabel="Přidat" addPlaceholder="Název modelu, např. gemini-3.8-flash" />
        <p className="hint" style={{ margin: 0 }}>Zkouší se shora dolů. Když model u všech klíčů selže (vyčerpaný limit, vyřazený model), použije se další. Stačí i jediný.</p>
      </div>
      <div className="field">
        <span>API klíče Google AI ({k.length})</span>
        <ListEditor rows={k} setRows={setK} mono placeholder="Komentář (např. čí je účet)" addLabel="Přidat" addPlaceholder="Vlož nový klíč" />
        <p className="hint" style={{ margin: 0 }}>Klíče vytvoříš na aistudio.google.com/apikey. Ukládají se šifrovaně a znovu se už nezobrazí. Když jeden dosáhne limitu, použije se další v pořadí.{!k.length && " Bez klíče je shrnutí předmětů vypnuté."}</p>
      </div>
      <div className="btn-row"><Submit>Uložit</Submit></div>
    </ActionForm>
  );
}
