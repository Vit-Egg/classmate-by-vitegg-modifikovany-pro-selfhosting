"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Přihlášení v rámu Classmate: otevře přihlášení v novém okně, to po přihlášení pošle jednorázový token
 * a rám si ho vymění za relaci v dělené cookie (platí jen pro vložení v Classmate). Stejný soubor je v plné i odlehčené verzi.
 */
export function CmLogin({ always = false, name = "tomuhle serveru" }: { always?: boolean; name?: string }) {
  const [state, setState] = useState<"idle" | "wait" | "blocked" | "error">("idle");
  const win = useRef<Window | null>(null);
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== location.origin || (win.current && e.source !== win.current)) return;
      const d = e.data as { type?: string; token?: string };
      if (d?.type !== "classmate-login" || typeof d.token !== "string") return;
      const r = await fetch("/classmate/session", { method: "POST", body: d.token, credentials: "include" }).catch(() => null);
      if (r?.ok) location.reload();
      else setState("error");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const open = () => {
    const w = window.open("/classmate/login", "cm-login", "width=520,height=720");
    if (!w) return setState("blocked");
    win.current = w;
    setState("wait");
  };
  return (
    <div className={always ? undefined : "cm-login"}>
      <div className="card card-pad stack" style={{ maxWidth: 460 }}>
        <b>Přihlas se k {name}</b>
        <p className="hint" style={{ margin: 0 }}>Otevře se okno s přihlášením. Po přihlášení se tady všechno načte samo.</p>
        <div><button type="button" className="btn primary" onClick={open}>{state === "wait" ? "Otevřít přihlášení znovu" : "Přihlásit se"}</button></div>
        {state === "wait" && <p className="hint" style={{ margin: 0 }}>Dokonči přihlášení v novém okně.</p>}
        {state === "blocked" && <p className="msg-error">Prohlížeč zablokoval nové okno. Povol vyskakovací okna a zkus to znovu.</p>}
        {state === "error" && <p className="msg-error">Přihlášení se nepodařilo předat. Zkus to znovu.</p>}
      </div>
    </div>
  );
}

/** Obsah okna s přihlášením: předá token rámu, který okno otevřel, a zavře se. */
export function CmLoginDone({ token }: { token: string }) {
  const [msg, setMsg] = useState("Předávám přihlášení…");
  useEffect(() => {
    if (!window.opener) return setMsg("Přihlášení je hotové. Tohle okno otevři tlačítkem Přihlásit se v Classmate.");
    window.opener.postMessage({ type: "classmate-login", token }, location.origin);
    setMsg("Hotovo, okno se zavře.");
    const t = setTimeout(() => window.close(), 600);
    return () => clearTimeout(t);
  }, [token]);
  return <p style={{ padding: 32, fontSize: 16 }}>{msg}</p>;
}
