import fs from "node:fs";
import { dataDir } from "./paths";

/** Volné místo na disku s daty (bajty), nebo null, když ho systém neumí zjistit. Drží se 30 s v paměti. */
let cache: { at: number; free: number | null } | null = null;
export function diskFree(): number | null {
  const now = Date.now();
  if (cache && now - cache.at < 30_000) return cache.free;
  let free: number | null = null;
  try {
    const s = fs.statfsSync(dataDir());
    free = Number(s.bavail) * Number(s.bsize);
  } catch {}
  cache = { at: now, free };
  return free;
}

export function diskTotal(): number | null {
  try {
    const s = fs.statfsSync(dataDir());
    return Number(s.blocks) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Kolik místa musí na disku zůstat volné, aby se ještě přijímaly nahrávky, obrázky a přílohy (DISK_MIN_FREE_MB, výchozí 1024). */
const minFree = () => {
  const n = Number(process.env.DISK_MIN_FREE_MB);
  return (Number.isFinite(n) && n >= 0 ? n : 1024) * 1024 * 1024;
};

/** Je na disku tak málo místa, že se nemají přijímat další soubory? Textové poznámky a databáze se nikdy neblokují. */
export const diskLow = () => {
  const f = diskFree();
  return f != null && f < minFree();
};

export const DISK_LOW_MESSAGE = "Server má teď málo místa na disku, nahrávání souborů je dočasně vypnuté. Správce o tom ví nebo mu napiš přes Mám nápad.";
