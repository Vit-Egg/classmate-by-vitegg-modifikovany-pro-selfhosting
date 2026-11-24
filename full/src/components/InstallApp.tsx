"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone, promptInstall } from "@/lib/pwa";
import { Icon } from "./Icon";

/** Instalace aplikace na plochu: tlačítko tam, kde ho prohlížeč umí, a návod tam, kde ne (iPhone). */
export function InstallApp() {
  const [state, setState] = useState<"loading" | "installed" | "can" | "ios" | "other">("loading");
  const refresh = () => setState(isStandalone() ? "installed" : window.__classmateInstall ? "can" : isIos() ? "ios" : "other");
  useEffect(() => {
    refresh();
    window.addEventListener("classmate:install-state", refresh);
    return () => window.removeEventListener("classmate:install-state", refresh);
  }, []);

  if (state === "loading") return null;
  return (
    <div className="card share-all">
      <div>
        <b>{state === "installed" ? "Aplikace je nainstalovaná" : "Nainstalovat Classmate"}</b>
        <small>
          {state === "installed" && "Běží jako samostatná aplikace, bez lišt prohlížeče. Funguje i bez připojení (uvidíš naposledy otevřené stránky)."}
          {state === "can" && "Vlastní ikona, samostatné okno, rychlý start a práce bez připojení. Zabere pár vteřin."}
          {state === "ios" && "V Safari klepni na tlačítko Sdílet a vyber Přidat na plochu. Upozornění na iPhonu fungují až z nainstalované aplikace."}
          {state === "other" && "V nabídce prohlížeče vyber Nainstalovat aplikaci nebo Přidat na plochu. V některých prohlížečích tahle volba není."}
        </small>
      </div>
      {state === "can" && (
        <button type="button" className="btn primary" onClick={() => void promptInstall()}>
          <Icon name="download" size={15} /> Nainstalovat
        </button>
      )}
    </div>
  );
}
