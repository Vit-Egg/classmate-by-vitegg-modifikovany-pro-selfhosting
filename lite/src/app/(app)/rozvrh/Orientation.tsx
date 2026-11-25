"use client";

import Link from "next/link";

/**
 * Přepínač rozvrhu vodorovně / svisle. Volba je v adrese (`?o=h|v`) a zapamatuje se v cookie, i v rámu Classmate
 * (cookie je „Partitioned“, takže platí jen pro lite vložený v Classmate).
 */
export function Orientation({ current, t }: { current: "h" | "v"; t: string }) {
  const remember = (o: "h" | "v") => {
    try {
      const inFrame = window.self !== window.top;
      document.cookie = `tt_view=${o}; path=/; max-age=31536000; SameSite=${inFrame ? "None; Secure; Partitioned" : "Lax"}`;
    } catch {}
  };
  return (
    <nav className="seg" aria-label="Zobrazení rozvrhu">
      <Link href={`/rozvrh?t=${t}&o=h`} aria-current={current === "h"} onClick={() => remember("h")}>Vodorovně</Link>
      <Link href={`/rozvrh?t=${t}&o=v`} aria-current={current === "v"} onClick={() => remember("v")}>Svisle</Link>
    </nav>
  );
}
