"use client";

import { useEffect } from "react";
import { confetti } from "@/lib/confetti";

/** Když na stránce jsou pochvaly, které jsi ještě neviděl, jednou se vystřelí konfety. Co už bylo viděno, se pamatuje v prohlížeči. */
export function AchBurst({ fresh }: { fresh: string[] }) {
  useEffect(() => {
    if (!fresh.length) return;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem("ach-seen") ?? "[]");
      const news = fresh.filter((id) => !seen.includes(id));
      if (!news.length) return;
      localStorage.setItem("ach-seen", JSON.stringify([...seen, ...news].slice(-300)));
      // první návštěva s hromadou starých pochval konfety nepotřebuje: jen když je mezi novými aspoň jedna a není jich přes deset
      if (news.length <= 10) setTimeout(() => confetti(document.body, 0.3), 350);
    } catch {}
  }, [fresh]);
  return null;
}
