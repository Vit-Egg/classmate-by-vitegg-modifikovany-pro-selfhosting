"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Vyhledávací pole, které filtruje už při psaní (bez Enteru a bez obnovení stránky). Ostatní parametry v URL zachová. */
export function LiveSearch({ placeholder, label, param = "q", initial = "" }: { placeholder: string; label: string; param?: string; initial?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // když se URL změní zvenčí (např. odkaz s jiným hledáním), srovnej pole
  useEffect(() => {
    setValue(sp.get(param) ?? "");
  }, [sp, param]);

  const push = (v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v.trim()) q.set(param, v);
    else q.delete(param);
    start(() => router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false }));
  };

  return (
    <form className="stack live-search" role="search" onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); push(value); }}>
      <input
        className="input"
        type="search"
        name={param}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        data-pending={pending || undefined}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => push(e.target.value), 220);
        }}
      />
    </form>
  );
}
