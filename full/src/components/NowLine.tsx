"use client";

import { useEffect, useState } from "react";
import { pragueClock } from "@/lib/dates";
import { tickAligned } from "@/lib/ticker";

/** Čára „teď“ uvnitř řádku hodiny na Dnes: ve vyučování podle času, o přestávce na dolní hraně hodiny, která právě skončila. */
export function NowLine({ begin, end, nextBegin }: { begin: number; end: number; nextBegin: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    return tickAligned(() => setNow(pragueClock()), 5_000);
  }, []);
  if (now == null) return null;
  let frac: number;
  if (now >= begin && now < end) frac = (now - begin) / (end - begin);
  else if (now >= end && nextBegin != null && now < nextBegin) frac = 1;
  else return null;
  const t = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
  return <div className="now-line" style={{ top: `${frac * 100}%` }} data-t={t} aria-hidden />;
}
