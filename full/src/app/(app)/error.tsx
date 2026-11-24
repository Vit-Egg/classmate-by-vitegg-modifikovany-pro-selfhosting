"use client";

import { useEffect } from "react";

/** Chyba na jedné stránce aplikace: menu zůstane, uživatel dostane srozumitelnou zprávu a může to zkusit znovu. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Něco se pokazilo</h1>
          <p className="subtitle">Tuhle stránku se nepodařilo načíst. Zbytek aplikace funguje.</p>
        </div>
      </div>
      <div className="card card-pad" style={{ display: "grid", gap: 14, maxWidth: 560 }}>
        <p style={{ margin: 0 }}>Zkus to prosím znovu. Když se to opakuje, napiš správci a přilož tenhle kód, ať chybu najde v logu:</p>
        {error.digest && <code style={{ padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)", width: "fit-content" }}>{error.digest}</code>}
        <div className="btn-row">
          <button className="btn primary" onClick={reset}>Zkusit znovu</button>
          <a className="btn" href="/dnes">Zpět na Dnes</a>
        </div>
      </div>
    </div>
  );
}
