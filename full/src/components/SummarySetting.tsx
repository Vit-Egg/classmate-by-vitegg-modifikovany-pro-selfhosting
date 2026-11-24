"use client";

import { useState } from "react";
import { savePref } from "@/app/actions/settings";

export function SummarySetting({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <>
      <div className="set-row">
        <div>
          <b>Shrnutí předmětů</b>
          <small>Na stránce předmětu ukáže souhrn ze známek, témat hodin, testů a zkoušení, úkolů a tvých poznámek</small>
        </div>
        <button type="button" className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label="Shrnutí předmětů" onClick={() => { setOn(!on); void savePref("ai_sum", !on ? "1" : "0"); }}><i /></button>
      </div>
      <p className="set-note">Podklady se odesílají do služby Google Gemini (bez jména; zahrnují i položky „jen pro mě“).</p>
    </>
  );
}
