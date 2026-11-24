/**
 * Volitelná statistika návštěvnosti aplikace (vlastní Umami, bez cookies). Zapíná se v .env:
 * ANALYTICS_SRC (adresa skriptu, například https://stats.classmate.cz/script.js) a ANALYTICS_WEBSITE_ID (id webu z Umami).
 * Do statistik se neposílá nic o přihlášených lidech: adresy se zbavují čísel (poznámka 123 je jen /poznamky/:id), hledaný text,
 * odkazující stránka i titulek stránky se neposílají a prohlížeč s Do Not Track se nepočítá.
 */
export function analyticsConfig(): { src: string; siteId: string; origin: string } | null {
  const src = process.env.ANALYTICS_SRC?.trim() ?? "";
  const siteId = process.env.ANALYTICS_WEBSITE_ID?.trim() ?? "";
  if (!src || !/^[0-9a-f-]{8,64}$/i.test(siteId)) return null;
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return null;
    return { src: u.toString(), siteId, origin: u.origin };
  } catch {
    return null;
  }
}

/** Před odesláním do Umami: bez čísel v adrese, bez titulku a odkazující stránky. */
export const ANALYTICS_CLEAN = `window.cmStats=function(t,p){try{p.url=String(p.url||"").replace(/\\/\\d+(?=\\/|$)/g,"/:id");p.title="";p.referrer="";}catch(e){}return p}`;
