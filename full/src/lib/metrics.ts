/**
 * Počítadla za běhu (v paměti procesu, po restartu začínají znovu): jak si vedou Bakaláři jednotlivých škol a jak dlouho trvá synchronizace na pozadí.
 * Ukazují se ve Správě → Stav serveru, aby šlo při velkém náporu poznat, kde je potíž (výpadek školy, přetížení, pomalá synchronizace).
 */

export type BkStat = { ok: number; fail: number; open: number; waiting: number; active: number; lastFailAt: number | null; consecutive: number; openUntil: number; avgMs: number };
export type SyncStat = { lastStart: number | null; lastEnd: number | null; users: number; skipped: number; failed: number; durationMs: number; schools: number };

type Store = { bk: Map<string, BkStat>; sync: SyncStat; startedAt: number };
const g = globalThis as unknown as { __classmateMetrics?: Store };
const store = (g.__classmateMetrics ??= {
  bk: new Map<string, BkStat>(),
  sync: { lastStart: null, lastEnd: null, users: 0, skipped: 0, failed: 0, durationMs: 0, schools: 0 },
  startedAt: Date.now(),
});

export const bkStat = (origin: string): BkStat => {
  let s = store.bk.get(origin);
  if (!s) store.bk.set(origin, (s = { ok: 0, fail: 0, open: 0, waiting: 0, active: 0, lastFailAt: null, consecutive: 0, openUntil: 0, avgMs: 0 }));
  return s;
};
export const allBkStats = () => [...store.bk.entries()];
export const syncStat = () => store.sync;
export const processStartedAt = () => store.startedAt;
