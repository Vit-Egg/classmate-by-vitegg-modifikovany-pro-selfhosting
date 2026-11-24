"use client";

import { useState } from "react";
import { savePref } from "@/app/actions/settings";
import { PROVIDERS, buildPrompt, chatUrl, type ChatContext } from "@/lib/ai-chat";
import { Icon } from "../Icon";

/**
 * Chat k látce: otázka se neposílá do naší aplikace, ale otevře se tvoje oblíbená AI s hotovou zprávou (otázka + kontext sady).
 * Tam už jen potvrdíš odeslání. Zvolená AI se pamatuje u účtu.
 */
export function StudyChat({ context, initialProvider }: { context: ChatContext; initialProvider: string }) {
  const [provider, setProvider] = useState(PROVIDERS.some((p) => p.id === initialProvider) ? initialProvider : PROVIDERS[0].id);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const p = PROVIDERS.find((x) => x.id === provider)!;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    const m = buildPrompt(question, context);
    // celá zpráva se zkopíruje i do schránky: u AI bez předvyplnění a pro případ, že se zkrácená verze nebude hodit
    let copied = false;
    try {
      await navigator.clipboard.writeText(m.full);
      copied = true;
    } catch {}
    window.open(chatUrl(p, m.text), "_blank", "noopener,noreferrer");
    setNote(
      p.copyOnly
        ? copied ? `Zpráva je zkopírovaná. Vlož ji (Ctrl/Cmd + V) v otevřeném okně ${p.name} a odešli.` : `${p.name} je otevřený, zprávu tam bohužel nešlo předvyplnit.`
        : m.trimmed ? `${p.name} je otevřený. Kontext byl kvůli délce adresy zkrácený${copied ? ", celá zpráva je ve schránce" : ""}.` : `${p.name} je otevřený, stačí potvrdit odeslání.`,
    );
  };

  return (
    <section className="card study-chat">
      <div className="study-chat-head">
        <span className="study-chat-ic"><Icon name="cap" size={18} /></span>
        <div>
          <h3>Zeptej se na cokoliv k látce</h3>
          <p>Odpoví ti tvoje AI. Otázku s celým kontextem sady jí předvyplníme, ty jen odešleš.</p>
        </div>
      </div>
      <form onSubmit={send} className="study-chat-form">
        <textarea className="textarea" rows={3} maxLength={2000} value={q} onChange={(e) => { setQ(e.target.value); setNote(""); }} placeholder="Např. Vysvětli mi jednodušeji, jak se liší hmotnost a tíha…" aria-label="Tvoje otázka" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
        <div className="study-chat-bar">
          <label className="study-chat-pick">
            <span>AI</span>
            <select className="select" value={provider} onChange={(e) => { setProvider(e.target.value); setNote(""); void savePref("ai_chat", e.target.value); }}>
              {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <button type="submit" className="btn primary" disabled={!q.trim()}>Otevřít v {p.name}</button>
        </div>
        {note && <p className="hint study-chat-note" role="status">{note}</p>}
        <p className="hint" style={{ margin: 0 }}>Otázka a podklady se po kliknutí otevřou ve zvolené AI mimo naši aplikaci, pro její podmínky a limity platí pravidla té služby.</p>
      </form>
    </section>
  );
}
