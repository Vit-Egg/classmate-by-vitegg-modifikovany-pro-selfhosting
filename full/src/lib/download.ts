/**
 * Stažení exportu dat. Nejdřív rychle ověříme, že export jde sestavit (a případně ukážeme důvod),
 * pak spustíme běžné stažení přímo prohlížečem – bez blobů, takže ho nebrzdí ani přísná CSP.
 */
export async function downloadMyData(): Promise<string | null> {
  try {
    const res = await fetch("/nastaveni/data?check=1", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return res.status === 401 ? "Přihlášení vypršelo, přihlas se znovu." : res.status === 404 ? "Export na serveru chybí (404), aktualizuj aplikaci." : `Stažení se nepovedlo (chyba ${res.status}).`;
    window.location.assign("/nastaveni/data");
    return null;
  } catch {
    return "Stažení se nepovedlo, zkontroluj připojení.";
  }
}
