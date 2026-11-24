"use client";

import { useState } from "react";

/** Platba kartou: server založí Stripe Checkout (částku bere z databáze) a prohlížeč se na něj přesměruje. */
export function PayButton({ payment, label }: { payment: number; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pokladna/zaplatit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payment }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && j.url && j.url.startsWith("https://checkout.stripe.com/")) {
        window.location.assign(j.url);
        return;
      }
      setError(j.error ?? "Platbu se nepodařilo založit.");
    } catch {
      setError("Spojení se nepovedlo, zkus to znovu.");
    }
    setBusy(false);
  };
  return (
    <div className="pay">
      <button type="button" className="btn primary" disabled={busy} onClick={go}>{busy ? "Přesměrovávám…" : label}</button>
      {error && <p className="msg-error" role="alert">{error}</p>}
    </div>
  );
}
