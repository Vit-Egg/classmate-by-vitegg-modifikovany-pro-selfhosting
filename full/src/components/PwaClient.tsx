"use client";

import { useEffect } from "react";
import { ensurePushSubscription, registerSw, type InstallEvent } from "@/lib/pwa";
import { forgetPrefetch, prefetchForOffline } from "@/lib/offline";

const toast = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent("classmate:toast", { detail }));

/** Registrace service workeru, hlídání nové verze a zachycení nabídky instalace. Nic nevykresluje. */
export function PwaClient() {
  useEffect(() => {
    // nabídka instalace přijde jen jednou a brzy, proto ji držíme pro tlačítka v Nastavení a paletě
    const before = (e: Event) => {
      e.preventDefault();
      window.__classmateInstall = e as InstallEvent;
      window.dispatchEvent(new Event("classmate:install-state"));
    };
    const installed = () => {
      window.__classmateInstall = null;
      window.dispatchEvent(new Event("classmate:install-state"));
      toast({ title: "Aplikace Classmate je nainstalovaná", body: "Najdeš ji mezi aplikacemi.", icon: "check" });
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);

    let hadController = !!navigator.serviceWorker?.controller;
    const changed = () => {
      // první převzetí (nová instalace) nehlásíme, jen skutečnou aktualizaci
      if (!hadController) return void (hadController = true);
      toast({ title: "Je tu nová verze Classmate", body: "Obnov stránku, ať ji začneš používat.", icon: "refresh", action: { label: "Obnovit", run: () => location.reload() }, sticky: true });
    };
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    void registerSw().catch(() => null).then((reg) => {
      if (reg) navigator.serviceWorker.ready.then(() => ensurePushSubscription(reg)).catch(() => {});
      // hlavní stránky a poslední poznámky se uloží dopředu, aby šly otevřít bez internetu
      void prefetchForOffline();
      window.addEventListener("online", () => void prefetchForOffline());
      // při návratu do aplikace se zeptáme, jestli nevyšla novější verze
      const check = () => {
        if (document.visibilityState !== "visible") return;
        reg?.update().catch(() => {});
        void prefetchForOffline();
      };
      document.addEventListener("visibilitychange", check);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installed);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, []);
  return null;
}

/** Po odhlášení smaže stránky uložené pro offline režim. */
export function ClearOfflinePages() {
  useEffect(() => {
    forgetPrefetch();
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGES" });
  }, []);
  return null;
}
