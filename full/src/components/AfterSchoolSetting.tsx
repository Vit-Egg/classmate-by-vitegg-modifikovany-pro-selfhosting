"use client";

import { useState } from "react";
import { savePref } from "@/app/actions/settings";

/** Po skončení výuky se na stránce Dnes místo dnešního rozvrhu ukáže zítřejší (výchozí je zapnuto). */
export function AfterSchoolSetting({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="set-row">
      <div>
        <b>Po škole ukázat zítřejší rozvrh</b>
        <small>Jakmile skončí poslední hodina, ukáže se na stránce Dnes místo dnešního rozvrhu ten zítřejší (v pátek a o víkendu pondělní).</small>
      </div>
      <button type="button" className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label="Po škole ukázat zítřejší rozvrh" onClick={() => { setOn(!on); void savePref("after_tomorrow", !on ? "1" : "0"); }}><i /></button>
    </div>
  );
}
