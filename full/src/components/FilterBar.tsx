"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterDef = { param: string; label: string; options: { value: string; label: string }[]; /** u položek bez výběru (výchozí hodnota) se parametr z adresy odebere */ all?: string };
const CUSTOM = "vlastni";

/** Řádek filtrů nad seznamem. Hodnoty žijí v adrese (jde je sdílet a přežijí obnovení), ostatní parametry zůstanou. */
export function FilterBar({ filters, dateParam, dateLabel = "Do data" }: { filters: FilterDef[]; dateParam?: string; dateLabel?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (param: string, value: string) => {
    const q = new URLSearchParams(sp.toString());
    if (value) q.set(param, value);
    else q.delete(param);
    start(() => router.replace(q.size ? `${path}?${q}` : path, { scroll: false }));
  };
  const active = filters.some((f) => sp.get(f.param)) || (dateParam && sp.get(dateParam));
  const dateVal = dateParam ? sp.get(dateParam) ?? "" : "";
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dateVal);
  return (
    <div className="filter-bar" data-pending={pending || undefined}>
      {filters.map((f) => (
        <label key={f.param} className="filter">
          <span>{f.label}</span>
          <select className="select small-select" value={sp.get(f.param) ?? ""} onChange={(e) => set(f.param, e.target.value)}>
            <option value="">{f.all ?? "Vše"}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
      {dateParam && (
        <>
          <label className="filter">
            <span>{dateLabel}</span>
            <select className="select small-select" value={isDate ? CUSTOM : dateVal} onChange={(e) => set(dateParam, e.target.value === CUSTOM ? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) : e.target.value)}>
              <option value="">Kdykoli</option>
              <option value="tyden">Do konce týdne</option>
              <option value="14d">Do 14 dní</option>
              <option value="mesic">Do měsíce</option>
              <option value={CUSTOM}>Vlastní datum…</option>
            </select>
          </label>
          {isDate && <input className="input small-select" type="date" value={dateVal} aria-label={dateLabel} onChange={(e) => e.target.value && set(dateParam, e.target.value)} />}
        </>
      )}
      {active && <button type="button" className="btn small" onClick={() => start(() => router.replace(path, { scroll: false }))}>Zrušit filtry</button>}
    </div>
  );
}
