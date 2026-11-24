"use client";

import { registerSw } from "@/lib/pwa";
import { useCallback, useEffect, useState } from "react";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Zapnutí Web Push upozornění na tomhle zařízení. Přijdou i když je Classmate zavřená. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (!supported) return setState(ios && !standalone ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setNote("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return void (await refresh());
      const reg = (await registerSw())!;
      await navigator.serviceWorker.ready;
      const { key } = (await (await fetch("/api/push/key", { cache: "no-store" })).json()) as { key: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("server");
      setState("on");
    } catch (e) {
      setNote(e instanceof Error && e.message === "server" ? "Server odběr nepřijal." : "Zapnutí se nepovedlo. Tenhle prohlížeč push upozornění nejspíš nepodporuje.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const test = async () => {
    setBusy(true);
    const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => null);
    setNote(r?.error ? r.error : r?.sent ? "Zkušební upozornění odesláno." : "Nic se neodeslalo, zkus upozornění vypnout a zapnout znovu.");
    setBusy(false);
  };

  if (state === "loading") return null;
  if (state === "unsupported") return <p className="hint" style={{ margin: 0 }}>Tenhle prohlížeč push upozornění nepodporuje.</p>;
  if (state === "ios-install") return <p className="hint" style={{ margin: 0 }}>Na iPhonu a iPadu nejdřív přidej Classmate na plochu (Sdílet → Přidat na plochu) a otevři ji odtamtud. Pak půjdou upozornění zapnout.</p>;
  if (state === "denied") return <p className="hint" style={{ margin: 0 }}>Upozornění jsou v prohlížeči zablokovaná. Povolíš je v nastavení webu u adresního řádku.</p>;
  return (
    <div className="push-row">
      {state === "on" ? (
        <>
          <span className="push-on">Upozornění na tomto zařízení jsou zapnutá</span>
          <button type="button" className="btn small" disabled={busy} onClick={test}>Poslat zkušební</button>
          <button type="button" className="btn small" disabled={busy} onClick={disable}>Vypnout</button>
        </>
      ) : (
        <button type="button" className="btn primary small" disabled={busy} onClick={enable}>Zapnout upozornění na tomto zařízení</button>
      )}
      {note && <span className="hint" style={{ margin: 0 }}>{note}</span>}
    </div>
  );
}
