"use client";

import { useEffect } from "react";

/** Chyba mimo přihlášenou aplikaci (přihlášení, registrace, zásady…): srozumitelná zpráva místo prázdné stránky. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 460 }}>
        <h1 className="title" style={{ margin: "0 0 12px" }}>Něco se pokazilo</h1>
        <p style={{ color: "var(--muted)", marginBottom: 22 }}>Stránku se teď nepodařilo načíst. Zkus to prosím znovu za chvíli.{error.digest ? ` Kód chyby: ${error.digest}` : ""}</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={reset}>Zkusit znovu</button>
          <a className="btn" href="/">Úvodní stránka</a>
        </div>
      </div>
    </main>
  );
}
