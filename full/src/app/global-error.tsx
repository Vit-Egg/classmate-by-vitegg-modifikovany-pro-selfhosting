"use client";

/** Poslední pojistka, kdyby selhal i hlavní layout: nejjednodušší stránka bez závislostí na stylech aplikace. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="cs">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#0f1013", color: "#f1f2f4", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ margin: "0 0 12px" }}>Classmate se na chvíli zasekl</h1>
          <p style={{ opacity: 0.7, marginBottom: 22 }}>Zkus stránku načíst znovu. Tvoje data jsou v bezpečí.</p>
          <button onClick={reset} style={{ font: "inherit", padding: "10px 20px", borderRadius: 12, border: 0, background: "#4ae0a0", color: "#04251a", fontWeight: 700, cursor: "pointer" }}>Zkusit znovu</button>
        </div>
      </body>
    </html>
  );
}
