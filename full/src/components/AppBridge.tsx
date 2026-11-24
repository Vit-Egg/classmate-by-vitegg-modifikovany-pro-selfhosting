"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getNative, nativeInfo } from "@/lib/native";

let linking = false;

/** Barva podkladu stránky jako #rrggbb a zda je světlá (pro barvu ikon ve stavovém řádku). */
function pageColors() {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
  if (!m) return null;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return { hex, light: (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 };
}

/**
 * Spojuje stránku s mobilní aplikací (jen tam, kde existuje `window.ClassmateNative`):
 * - barvy stavového řádku podle motivu stránky,
 * - po přihlášení spáruje zařízení se serverem (token pro widget a trvalou notifikaci),
 * - po odhlášení spárování zruší.
 * V běžném prohlížeči nedělá nic.
 */
export function AppBridge({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();

  useEffect(() => {
    const native = getNative();
    if (!native) return;
    const bars = () => {
      const c = pageColors();
      if (c) native.setBars(c.hex, c.light);
    };
    bars();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bars);
    window.addEventListener("classmate:theme", bars);
    return () => {
      mq.removeEventListener("change", bars);
      window.removeEventListener("classmate:theme", bars);
    };
  }, []);

  useEffect(() => {
    const native = getNative();
    const info = nativeInfo();
    if (!native || !info) return;
    if (!signedIn) {
      // přihlašovací stránka = nikdo není přihlášen: zapomenout spárování
      if (info.linked && path.startsWith("/prihlaseni")) native.unlink();
      return;
    }
    if (info.linked || linking) return;
    linking = true;
    fetch("/api/app/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: info.platform, name: info.device, fcmToken: info.fcmToken, appVersion: info.version }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ token: string }>) : null))
      .then((j) => j && native.link(j.token))
      .catch(() => {})
      .finally(() => {
        linking = false;
      });
  }, [signedIn, path]);

  return null;
}
