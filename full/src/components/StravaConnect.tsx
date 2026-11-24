"use client";

import { useState } from "react";
import { connectStrava } from "@/app/actions/obedy";
import { ActionForm, Submit } from "./forms";

/** Zapnutí obědů: buď jen číslem jídelny (jen jídelníček), nebo přihlášením (kredit a objednávání). */
export function StravaConnect({ upgrade = false, canteen = "" }: { upgrade?: boolean; canteen?: string }) {
  const [mode, setMode] = useState<"anon" | "login">(upgrade ? "login" : "anon");
  return (
    <ActionForm action={connectStrava} resetOnSuccess={false}>
      <input type="hidden" name="mode" value={mode} />
      {!upgrade && (
        <div className="seg" role="radiogroup" aria-label="Způsob propojení">
          <button type="button" role="radio" aria-checked={mode === "anon"} aria-pressed={mode === "anon"} onClick={() => setMode("anon")}>Jen jídelníček</button>
          <button type="button" role="radio" aria-checked={mode === "login"} aria-pressed={mode === "login"} onClick={() => setMode("login")}>Přihlášení</button>
        </div>
      )}
      <label className="field"><span>Číslo jídelny</span><input className="input" name="canteen" inputMode="numeric" placeholder="3753" autoComplete="off" defaultValue={canteen} required /></label>
      {mode === "login" ? (
        <>
          <label className="field"><span>Uživatelské jméno</span><input className="input" name="username" autoComplete="off" required /></label>
          <label className="field"><span>Heslo</span><input className="input" type="password" name="password" autoComplete="off" required /></label>
          <p className="hint" style={{ margin: 0 }}>Se přihlášením uvidíš kredit a objednávky a půjde z aplikace objednávat. Strava.cz neumí jiné dlouhodobé přihlášení, proto se heslo ukládá šifrovaně (AES-256) na serveru aplikace. Odpojením se smaže.</p>
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>Stačí číslo jídelny (najdeš ho na přihlašovací stránce Strava.cz). Uvidíš jídelníček, žádné heslo se neukládá. Objednávat a vidět kredit půjde až po přihlášení.</p>
      )}
      <div><Submit pendingText="Ověřuji…">{mode === "anon" ? "Zobrazit jídelníček" : "Propojit"}</Submit></div>
    </ActionForm>
  );
}
