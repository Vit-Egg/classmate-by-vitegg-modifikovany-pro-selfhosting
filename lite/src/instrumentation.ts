/** Synchronizace na pozadí: každých SYNC_MINUTES (výchozí 15, nejméně 10) stáhne data z Bakalářů, ať chodí upozornění a widgety jsou čerstvé. */
export async function register() {
  // podmínka musí obalit importy, jinak by se SQLite balilo i pro edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { needsSetup, setupToken } = await import("./lib/auth");
    if (needsSetup()) setupToken(); // vypíše instalační kód do logu
    const min = Number(process.env.SYNC_MINUTES ?? 15);
    if (min > 0) {
      const { syncAll } = await import("./lib/bk");
      const tick = () => syncAll(false).catch((e) => console.error("background sync failed", e));
      setTimeout(tick, 20_000);
      setInterval(tick, Math.max(10, min) * 60_000);
    }
  }
}
