"use client";

import { useState } from "react";
import { connectTodoistAction } from "@/app/actions/todoist";
import { ActionForm, Submit } from "./forms";

/** Propojení s Todoistem: přihlášením přes Todoist (OAuth, když ho server má nastavené), nebo osobním API tokenem. */
export function TodoistConnect({ project = "Classmate", oauth = false }: { project?: string; oauth?: boolean }) {
  const token = (
    <ActionForm action={connectTodoistAction} resetOnSuccess={false}>
      <label className="field">
        <span>API token z Todoistu</span>
        <input className="input" type="password" name="token" autoComplete="off" spellCheck={false} required />
        <p className="hint">V Todoistu otevři Nastavení → Integrace → Vývojáři a zkopíruj API token. V Classmate se ukládá šifrovaně.</p>
      </label>
      <label className="field">
        <span>Projekt v Todoistu</span>
        <input className="input" name="project" defaultValue={project} maxLength={120} />
        <p className="hint">Úkoly se zapisují do tohoto projektu, když neexistuje, založí se.</p>
      </label>
      <div><Submit pendingText="Ověřuji…">Propojit tokenem</Submit></div>
    </ActionForm>
  );
  const [name, setName] = useState(project);
  if (!oauth) return token;
  return (
    <>
      {/* běžný odkaz místo odeslání formuláře: CSP aplikace (form-action 'self') by přesměrování na todoist.com u formuláře zablokovalo */}
      <div>
        <label className="field">
          <span>Projekt v Todoistu</span>
          <input className="input" name="project" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <p className="hint">Úkoly se zapisují do tohoto projektu, když neexistuje, založí se.</p>
        </label>
        <div><a className="btn primary" href={`/nastaveni/todoist?project=${encodeURIComponent(name)}`}>Propojit přihlášením přes Todoist</a></div>
      </div>
      <details className="td-token">
        <summary>Nebo použít API token</summary>
        {token}
      </details>
    </>
  );
}
