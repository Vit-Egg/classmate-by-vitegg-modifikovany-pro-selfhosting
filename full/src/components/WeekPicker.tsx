"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Výběr přesného týdne v rozvrhu: kalendář (libovolný den týdne) a šipky o týden zpět a vpřed. */
export function WeekPicker({ monday, active, min, max }: { /** pondělí zobrazeného týdne */ monday: string; /** je právě vybraný konkrétní týden (ne záložka Tento/Příští/Stálý) */ active: boolean; min: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const go = (date: string) => {
    if (!date || date < min || date > max) return;
    const q = new URLSearchParams(sp.toString());
    q.delete("t");
    q.delete("open");
    q.set("d", date);
    router.push(`${pathname}?${q}`);
  };
  return (
    <div className={`week-pick${active ? " active" : ""}`} role="group" aria-label="Vybrat týden">
      <button type="button" className="icon-btn" aria-label="Předchozí týden" disabled={shift(monday, -7) < min} onClick={() => go(shift(monday, -7))}>‹</button>
      <input className="input" type="date" aria-label="Zobrazit týden, ve kterém je vybraný den" value={monday} min={min} max={max} onChange={(e) => go(e.target.value)} />
      <button type="button" className="icon-btn" aria-label="Další týden" disabled={shift(monday, 7) > max} onClick={() => go(shift(monday, 7))}>›</button>
    </div>
  );
}
