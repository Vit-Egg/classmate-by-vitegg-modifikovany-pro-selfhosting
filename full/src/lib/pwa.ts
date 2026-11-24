/** Společné pomocníky pro PWA (service worker, instalace). Jen v prohlížeči. */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __classmateInstall?: InstallEvent | null;
  }
}

export const registerSw = async () => {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/sw.js")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
};

export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Spustí systémové okno instalace, pokud ho prohlížeč nabízí. Vrací, zda uživatel souhlasil. */
export async function promptInstall() {
  const ev = window.__classmateInstall;
  if (!ev) return false;
  await ev.prompt();
  const r = await ev.userChoice;
  window.__classmateInstall = null;
  window.dispatchEvent(new Event("classmate:install-state"));
  return r.outcome === "accepted";
}

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Samoopravný odběr upozornění: kdo má oznámení povolená, tomu se při každém otevření aplikace odběr obnoví a pošle na server.
 * Prohlížeče odběry tiše ruší nebo mění (neaktivita, aktualizace), a pak by upozornění nechodila, aniž by si toho uživatel všiml.
 */
export async function ensurePushSubscription(reg: ServiceWorkerRegistration) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("PushManager" in window)) return;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = (await (await fetch("/api/push/key", { cache: "no-store" })).json()) as { key: string };
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  }
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
}
