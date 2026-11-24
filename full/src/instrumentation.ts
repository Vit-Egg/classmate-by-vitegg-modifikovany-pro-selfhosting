export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundSync, startEmailWorker, startTodoistWorker, startTrashCleanup } = await import("./lib/background");
    const { ensureDemoAccount } = await import("./lib/demo");
    ensureDemoAccount();
    // Čerstvý server: kód pro průvodce prvním spuštěním se vypíše do logu (bez něj by správcem mohl být kdokoli, kdo adresu otevře dřív)
    const { needsSetup, setupToken, setupTokenFromEnv } = await import("./lib/setup");
    if (needsSetup() && !setupTokenFromEnv()) console.log(`\nInstalační kód pro první spuštění (průvodce na /zprovozneni):\n${setupToken()}\n`);
    startBackgroundSync();
    startEmailWorker();
    startTodoistWorker();
    startTrashCleanup();
    // Při vypnutí (restart kontejneru, aktualizace) se deník zápisů vrátí do databáze, ať je soubor po startu čistý a záloha úplná.
    const g = globalThis as unknown as { __classmateShutdown?: boolean };
    if (!g.__classmateShutdown) {
      g.__classmateShutdown = true;
      const { db } = await import("./lib/db");
      process.once("SIGTERM", () => {
        try {
          db().pragma("wal_checkpoint(TRUNCATE)");
          console.log("Vypínám: databáze uložena.");
        } catch (e) {
          console.error("Vypínám: uložení databáze selhalo", e);
        }
      });
    }
  }
}
