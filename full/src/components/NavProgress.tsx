"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/** Tenký pruh nahoře, který ukazuje, že se otevírá další stránka. Spouští ho klik na odkaz nebo událost `classmate:nav-start`. */
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);

  // adresa se změnila = stránka je tady
  // (Next změní adresu už ve chvíli, kdy ukáže kostru stránky, proto se čeká, až kostra zmizí)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      setPhase((p) => (p === "run" ? "done" : p));
      t = setTimeout(() => setPhase((p) => (p === "done" ? "idle" : p)), 400);
    };
    const skeleton = () => document.querySelector('main [role="status"][aria-label^="Načítám"]');
    if (!skeleton()) finish();
    const poll = setInterval(() => {
      if (!skeleton()) {
        clearInterval(poll);
        finish();
      }
    }, 120);
    return () => {
      clearInterval(poll);
      if (t) clearTimeout(t);
    };
  }, [path, search]);

  useEffect(() => {
    const start = () => {
      setPhase("run");
      if (guard.current) clearTimeout(guard.current);
      guard.current = setTimeout(() => setPhase("idle"), 20_000); // pojistka, kdyby se nic nestalo
    };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noProgress !== undefined) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return; // stejná adresa, nic se nenačítá
      start();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("classmate:nav-start", start);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("classmate:nav-start", start);
      if (guard.current) clearTimeout(guard.current);
    };
  }, []);

  return <div className={`nav-progress ${phase}`} role="progressbar" aria-hidden={phase === "idle"} aria-label="Načítání stránky" />;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
