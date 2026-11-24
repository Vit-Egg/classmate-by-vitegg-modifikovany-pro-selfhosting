"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BellWidget } from "./Live";
import type { Slot } from "@/lib/schedule";

/**
 * Průběh hodiny (to, co je jinak vlevo dole v postranním panelu) i při celé obrazovce poznámky nebo tabule, kde panel není vidět.
 * Zobrazí se jen když je zapnutá celá obrazovka a vykreslí se do prvku, který je zrovna na celé obrazovce, jinak by ho prohlížeč skryl.
 */
export function FullscreenBell({ slots }: { slots: Slot[] }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const check = () => {
      if (!document.body.classList.contains("note-full")) return setHost(null);
      // nejdřív horní lišta s hodnocením (vpravo), jinak plovoucí štítek vlevo dole
      setHost(document.getElementById("note-bell-slot") ?? document.fullscreenElement ?? document.body);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("fullscreenchange", check);
    return () => {
      mo.disconnect();
      document.removeEventListener("fullscreenchange", check);
    };
  }, []);
  if (!host || !slots.length) return null;
  const inline = host.id === "note-bell-slot";
  return createPortal(
    <div className={inline ? "bell-inline" : "bell-float"}>
      <BellWidget slots={slots} />
    </div>,
    host,
  );
}
