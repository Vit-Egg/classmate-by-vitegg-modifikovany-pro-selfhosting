"use client";

import { useEffect } from "react";
import { sunIsUp } from "@/lib/sun";

/** Při vzhledu „Podle slunce“ přepne motiv, když slunce vyjde nebo zapadne (kontroluje se po minutě a při návratu na kartu). */
export function ThemeSun() {
  useEffect(() => {
    const check = () => {
      try {
        if ((localStorage.getItem("theme") || "sun") !== "sun") return;
        const want = sunIsUp(Date.now()) ? "light" : "dark";
        if (document.documentElement.dataset.theme !== want) document.documentElement.dataset.theme = want;
      } catch {}
    };
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
