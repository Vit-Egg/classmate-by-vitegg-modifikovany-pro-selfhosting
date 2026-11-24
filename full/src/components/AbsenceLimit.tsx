"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { savePref } from "@/app/actions/settings";

const CHOICES = [10, 15, 20, 25, 30, 33, 40, 50, 60, 70, 75, 80, 90];

/** Hranice zameškaných hodin, od které se absence zbarví a ukáže čárka. Výchozí je hodnota z Bakalářů. */
export function AbsenceLimit({ own, bakalari }: { own: number; bakalari: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="filter" data-pending={pending || undefined}>
      <span>Hranice absence</span>
      <select
        className="select small-select"
        value={own || ""}
        onChange={(e) => start(async () => { await savePref("abs_limit", e.target.value); router.refresh(); })}
      >
        <option value="">Podle Bakalářů ({bakalari} %)</option>
        {CHOICES.map((n) => <option key={n} value={n}>{n} %</option>)}
      </select>
    </label>
  );
}
