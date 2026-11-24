/**
 * Je v Praze právě den (slunce nad obzorem)? Zjednodušený výpočet východu a západu (NOAA), bez sítě a bez polohy.
 * Funkce je samostatná (nepoužívá nic zvenku), protože ji layout vkládá i přímo do stránky, aby se motiv určil před vykreslením.
 */
export function sunIsUp(ms: number): boolean {
  const LAT = 50.08, LON = 14.42; // Praha
  const rad = Math.PI / 180;
  const d = new Date(ms);
  const dayOfYear = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const g = (2 * Math.PI / 365) * (dayOfYear - 1 + 0.5);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / rad;
  const rise = 720 - 4 * (LON + ha) - eqTime; // minuty od půlnoci UTC
  const set = 720 - 4 * (LON - ha) - eqTime;
  const now = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  return now >= rise && now < set;
}
