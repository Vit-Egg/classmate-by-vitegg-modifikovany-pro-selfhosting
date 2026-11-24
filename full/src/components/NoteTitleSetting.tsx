"use client";

import { useState } from "react";
import { setNoteTitleTemplate } from "@/app/actions/settings";
import { NOTE_TITLE_DEFAULT, renderNoteTitle } from "@/lib/dates";
import { ActionForm, Submit } from "./forms";

const TOKENS: [string, string][] = [["{den}", "den v týdnu"], ["{datum}", "datum"], ["{d}", "den"], ["{m}", "měsíc"], ["{rok}", "rok"], ["{cas}", "čas"]];

export function NoteTitleSetting({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ActionForm action={setNoteTitleTemplate} resetOnSuccess={false}>
      <label className="field">
        <span>Výchozí název nové poznámky</span>
        <input className="input" name="template" value={value} maxLength={100} placeholder={NOTE_TITLE_DEFAULT} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
      </label>
      <div className="token-row">
        {TOKENS.map(([t, label]) => (
          <button key={t} type="button" className="chip plain token" title={label} onClick={() => setValue((v) => v + t)}>
            {t}
          </button>
        ))}
        <button type="button" className="chip plain token" onClick={() => setValue("")}>výchozí</button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Náhled: <b>{renderNoteTitle(value)}</b>
      </p>
      <div><Submit>Uložit</Submit></div>
    </ActionForm>
  );
}
