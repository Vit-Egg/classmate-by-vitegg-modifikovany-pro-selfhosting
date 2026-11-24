"use client";

import { useState } from "react";

/** „Řekni to spolužákům“: nativní sdílení (telefon), jinak zkopírování odkazu. Odkaz nese značku zdroje, ať se ví, odkud lidé přicházejí. */
export function ShareApp() {
  const [done, setDone] = useState(false);
  const url = `${location.origin}/?zdroj=sdileni`;
  const text = "Používám Classmate: rozvrh z Bakalářů, úkoly, testy a zkoušení a poznámky na jednom místě. Mrkni na to.";
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title: "Classmate", text, url });
          else {
            await navigator.clipboard.writeText(`${text} ${url}`);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          }
        } catch {}
      }}
    >
      {done ? "Odkaz zkopírován" : "Sdílet Classmate spolužákům"}
    </button>
  );
}
