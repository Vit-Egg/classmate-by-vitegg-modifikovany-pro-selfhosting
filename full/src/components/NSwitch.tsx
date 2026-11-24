"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { savePref } from "@/app/actions/settings";

/** Přepínač „Zobrazit N“ pro celý modul Známky (skryje známky bez číselné hodnoty); volba se pamatuje u účtu. */
export function NSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  return (
    <label className="gd-n-switch">
      <span>Zobrazit N</span>
      <button
        type="button"
        className={`switch${value ? " on" : ""}`}
        role="switch"
        aria-checked={value}
        aria-label="Zobrazit známky N"
        onClick={() => {
          setValue(!value);
          void savePref("marks_n", !value ? "1" : "0").then(() => router.refresh());
        }}
      >
        <i />
      </button>
    </label>
  );
}
