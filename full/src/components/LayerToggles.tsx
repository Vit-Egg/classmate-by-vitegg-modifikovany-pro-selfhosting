"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { savePref } from "@/app/actions/settings";
import type { CalKind } from "@/lib/calendar";

/** Zapínání a vypínání druhů položek v kalendáři. Volba se pamatuje u účtu. */
export function LayerToggles({ kinds, active }: { kinds: { id: CalKind; label: string }[]; active: CalKind[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const toggle = (id: CalKind) => {
    const next = active.includes(id) ? active.filter((k) => k !== id) : [...active, id];
    const v = next.length === kinds.length ? "" : next.length ? next.join(",") : "-";
    // pamatuje se, co je skryté, takže nové druhy položek jsou ve výchozím stavu vidět
    const hidden = kinds.filter((k) => !next.includes(k.id)).map((k) => k.id).join(",");
    document.cookie = `cal_hide=${hidden}; path=/; max-age=31536000; samesite=lax`;
    void savePref("cal_hide", hidden);
    const q = new URLSearchParams(sp.toString());
    if (v) q.set("l", v);
    else q.delete("l");
    router.replace(`${path}?${q}`);
  };
  return (
    <div className="layers" role="group" aria-label="Co zobrazit">
      {kinds.map((k) => (
        <button key={k.id} type="button" className={`layer k-${k.id}`} aria-pressed={active.includes(k.id)} onClick={() => toggle(k.id)}>
          <i /> {k.label}
        </button>
      ))}
    </div>
  );
}
