"use client";

import { useEffect, useState } from "react";
import { SwitchRow } from "./SwitchRow";

/** Vypínač sezónního motivu (např. Halloween). Ukazuje se jen v době, kdy motiv platí. */
export function SeasonToggle({ id, name }: { id: string; name: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(localStorage.getItem("season") !== "off");
    } catch {}
  }, []);
  const change = (v: boolean) => {
    setOn(v);
    try {
      if (v) localStorage.removeItem("season");
      else localStorage.setItem("season", "off");
    } catch {}
    if (v) document.documentElement.dataset.season = id;
    else document.documentElement.removeAttribute("data-season");
  };
  return <SwitchRow label={`Sezónní motiv: ${name}`} hint="Platí jen pár dní a zase sám zmizí. Jen v tomto prohlížeči." checked={on} onChange={change} />;
}
