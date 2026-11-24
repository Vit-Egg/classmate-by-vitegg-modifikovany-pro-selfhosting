/** Testy a úkoly se po termínu nemažou, zůstávají v historii (Úkoly → Historie, Testy a zkoušení → Historie). */
import { run } from "./db";

/**
 * Úklid technických záznamů, které by jinak rostly donekonečna (a držely zbytečná data): vypršená omezení pokusů,
 * vypršené relace a výzvy k 2FA, stará ID událostí Stripe. Bez toho by šlo databázi zahltit spoustou výmyslů v klíčích limitů.
 */
export function purgeHousekeeping() {
  const now = Date.now();
  run("DELETE FROM rate_limits WHERE reset_at < ?", now);
  run("DELETE FROM sessions WHERE expires_at < ?", now);
  run("DELETE FROM login_challenges WHERE expires_at < ?", now);
  run("DELETE FROM oauth_codes WHERE expires_at < ?", now);
  run("DELETE FROM oauth_tokens WHERE refresh_expires < ?", now);
  run("DELETE FROM cash_events WHERE created_at < ?", now - 90 * 86_400_000);
  // souhrny pro statistiky: rok a kousek zpět stačí
  run("DELETE FROM usage_hourly WHERE slot < ?", now - 400 * 86_400_000);
  run("DELETE FROM usage_daily WHERE day < ?", new Date(now - 400 * 86_400_000).toISOString().slice(0, 10));
  run("DELETE FROM usage_counts WHERE day < ?", new Date(now - 800 * 86_400_000).toISOString().slice(0, 10));
}
