"use client";

import { useState } from "react";
import { savePref } from "@/app/actions/settings";

/** Zapnutí percentilu u známek (výchozí je vypnuto). Nabízí se jen tomu, kdo sám sdílí známky do anonymních statistik. */
export function PercentileSetting({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="set-row">
      <div>
        <b>Ukazovat percentil</b>
        <small>U známek a celkového průměru se ukáže, kolik procent ostatních na tom bylo hůř než ty (štítek „lepší než X %“). Ve výchozím stavu je to skryté.</small>
      </div>
      <button type="button" className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label="Ukazovat percentil u známek" onClick={() => { setOn(!on); void savePref("marks_pct", !on ? "1" : "0"); }}><i /></button>
    </div>
  );
}
