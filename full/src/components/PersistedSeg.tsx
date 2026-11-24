"use client";

import { savePref } from "@/app/actions/settings";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Přepínač, který si svou volbu pamatuje u účtu, v cookie a v URL, takže po návratu zůstane stejný. */
export function PersistedSeg({ param, cookie, pref, options, current, label }: { param: string; cookie: string; /** klíč, pod kterým se volba pamatuje i u účtu (platí na všech zařízeních) */ pref?: string; options: { value: string; label: string }[]; current: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-current={current === o.value}
          onClick={() => {
            document.cookie = `${cookie}=${o.value}; path=/; max-age=31536000; samesite=lax`;
            if (pref) void savePref(pref, o.value);
            const q = new URLSearchParams(sp.toString());
            q.set(param, o.value);
            router.replace(`${pathname}?${q}`);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
