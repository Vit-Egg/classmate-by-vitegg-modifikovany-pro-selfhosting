"use client";

import { useRouter } from "next/navigation";
import { SIGNS } from "@/lib/horoscope";
import { savePref } from "@/app/actions/settings";

/** Volba znamení horoskopu na stránce Dnes; ukládá se u účtu. */
export function SignPicker({ sign }: { sign: string }) {
  const router = useRouter();
  return (
    <select
      className="input"
      aria-label="Znamení"
      value={sign}
      onChange={(e) => void savePref("horoscope", e.target.value).then(() => router.refresh())}
    >
      {!sign && <option value="">Vyber své znamení…</option>}
      {SIGNS.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.range})</option>)}
    </select>
  );
}
