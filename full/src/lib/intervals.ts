/**
 * Intervals.icu: načtení aktivit přes REST API (https://intervals.icu/api/v1) osobním API klíčem, který si uživatel vygeneruje v Nastavení → Developer Settings.
 * Přihlášení je Basic: uživatel „API_KEY“, heslo je klíč. ID sportovce „0“ znamená majitele klíče. Aktivity ze Stravy API nevrací (omezení Intervals.icu).
 * Server si k základní adrese může přesměrovat proměnná INTERVALS_BASE (testy).
 */
import { decrypt, encrypt } from "./crypto";
import { get, run } from "./db";
import { addDays, pragueNow } from "./dates";
import { TrainingError, addEntry, currentPeriod, periodRange, type Entry } from "./training";
import type { User } from "./session";

const BASE = process.env.INTERVALS_BASE || "https://intervals.icu/api/v1";
export const IMPORT_MAX_DAYS = 200;

export class IntervalsError extends Error {}

export const intervalsAccount = (userId: number) => get<{ athlete_id: string; last_sync_at: number | null }>("SELECT athlete_id, last_sync_at FROM intervals_accounts WHERE user_id = ?", userId);

type Raw = Record<string, unknown>;

async function call(athlete: string, key: string, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/athlete/${encodeURIComponent(athlete)}${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`, Accept: "application/json", "User-Agent": "Mozilla/5.0 Classmate/1.0" },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    throw new IntervalsError("Intervals.icu teď není dostupné, zkus to za chvíli.");
  }
  if (res.status === 401 || res.status === 403) throw new IntervalsError("Intervals.icu klíč nepřijalo. Zkontroluj API klíč a ID sportovce.");
  if (res.status === 404) throw new IntervalsError("Sportovec s tímto ID v Intervals.icu neexistuje.");
  if (res.status === 429) throw new IntervalsError("Intervals.icu hlásí moc požadavků, zkus to za chvíli.");
  if (!res.ok) throw new IntervalsError(`Intervals.icu odpovědělo chybou ${res.status}.`);
  return res.json().catch(() => {
    throw new IntervalsError("Intervals.icu poslalo odpověď, které nerozumím.");
  });
}

/** Uloží (a ověří) propojení. Klíč se ukládá šifrovaně. */
export async function connectIntervals(user: User, athleteInput: string, keyInput: string) {
  const athlete = athleteInput.trim() || "0";
  const key = keyInput.trim();
  if (!/^(0|i?\d{1,12})$/.test(athlete)) throw new IntervalsError("ID sportovce vypadá jako „i12345“ (najdeš ho v Intervals.icu v Nastavení), nebo nech 0.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new IntervalsError("API klíč vypadá jinak. Vygeneruj si ho v Intervals.icu: Nastavení → Developer Settings.");
  await call(athlete, key, "");
  run("INSERT INTO intervals_accounts (user_id, athlete_id, key_enc, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET athlete_id = excluded.athlete_id, key_enc = excluded.key_enc", user.id, athlete, encrypt(key), Date.now());
}

export const disconnectIntervals = (userId: number) => void run("DELETE FROM intervals_accounts WHERE user_id = ?", userId);

const TYPE_CS: Record<string, string> = {
  Ride: "Cyklistika", VirtualRide: "Virtuální cyklistika", Run: "Běh", VirtualRun: "Virtuální běh", TrailRun: "Terénní běh", Walk: "Chůze", Hike: "Turistika", Swim: "Plavání", OpenWaterSwim: "Plavání ve volné vodě",
  WeightTraining: "Posilování", Workout: "Cvičení", Yoga: "Jóga", Pilates: "Pilates", Rowing: "Veslování", NordicSki: "Běžky", AlpineSki: "Sjezdové lyžování", Snowboard: "Snowboard", IceSkate: "Bruslení",
  Soccer: "Fotbal", Tennis: "Tenis", Crossfit: "Crossfit", HIIT: "HIIT", Elliptical: "Eliptical", StairStepper: "Stepper", Rollerblade: "Kolečkové brusle", Kayaking: "Kajak", Canoeing: "Kánoe", Golf: "Golf",
};
const STRENGTH = /^(WeightTraining|Workout|Crossfit|HIIT|Yoga|Pilates)$/;

/** Převede aktivitu z Intervals.icu na zápis do deníku (cíl a zhodnocení si doplní žák). */
export function mapActivity(a: Raw): { ext: string; date: string; type: string; minutes: number; rpe: number | null; content: string } | null {
  const date = typeof a.start_date_local === "string" ? a.start_date_local.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || a.id === undefined || a.id === null) return null; // „prázdná“ aktivita (např. ze Stravy)
  const sec = Number(a.moving_time ?? a.elapsed_time ?? 0);
  const minutes = Math.max(1, Math.round((Number.isFinite(sec) ? sec : 0) / 60));
  const kind = String(a.type ?? "");
  const rpeRaw = Number(a.icu_rpe ?? a.perceived_exertion ?? NaN);
  const rpe = Number.isFinite(rpeRaw) && rpeRaw >= 1 ? Math.min(10, Math.round(rpeRaw)) : null;
  const km = Number(a.distance) > 0 ? `${(Number(a.distance) / 1000).toFixed(1).replace(".", ",")} km` : "";
  const desc = typeof a.description === "string" ? a.description.trim().slice(0, 800) : "";
  const content = [String(a.name ?? "").trim() || TYPE_CS[kind] || kind, [TYPE_CS[kind] ?? kind, km].filter(Boolean).join(", "), desc].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ");
  return { ext: String(a.id), date, type: a.race ? "Závod" : STRENGTH.test(kind) ? "Kondiční příprava" : "Trénink", minutes, rpe, content: content.slice(0, 1500) };
}

export type ImportResult = { added: number; skipped: number; full: number; total: number };

/** Načte aktivity za období a přidá ty, které v deníku ještě nejsou (už dřív načtené a upravené se nepřepisují). */
export async function importIntervals(user: User, from: string, to: string): Promise<ImportResult> {
  const acc = get<{ athlete_id: string; key_enc: string }>("SELECT athlete_id, key_enc FROM intervals_accounts WHERE user_id = ?", user.id);
  if (!acc) throw new IntervalsError("Nejdřív propoj Intervals.icu.");
  const today = pragueNow().date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new IntervalsError("Vyber období (od, do).");
  const end = to > today ? today : to;
  if (from > end) throw new IntervalsError("Za budoucí dny se nic načíst nedá.");
  if (Date.parse(end) - Date.parse(from) > IMPORT_MAX_DAYS * 86_400_000) throw new IntervalsError(`Načíst jde najednou nejvýš ${IMPORT_MAX_DAYS} dní.`);
  const list = await call(acc.athlete_id, decrypt(acc.key_enc), `/activities?oldest=${from}&newest=${end}`);
  if (!Array.isArray(list)) throw new IntervalsError("Intervals.icu poslalo odpověď, které nerozumím.");
  let added = 0, skipped = 0, full = 0;
  for (const raw of [...(list as Raw[])].reverse()) {
    const m = mapActivity(raw);
    if (!m) { skipped++; continue; }
    if (get("SELECT 1 FROM training_entries WHERE user_id = ? AND source = 'intervals' AND ext_id = ?", user.id, m.ext)) { skipped++; continue; }
    try {
      addEntry(user, { date: m.date, type: m.type, minutes: m.minutes, rpe: m.rpe, content: m.content }, "intervals", m.ext);
      added++;
    } catch (e) {
      if (!(e instanceof TrainingError)) throw e;
      full++;
    }
  }
  run("UPDATE intervals_accounts SET last_sync_at = ? WHERE user_id = ?", Date.now(), user.id);
  return { added, skipped, full, total: (list as Raw[]).length };
}

/** Výchozí období načtení: od začátku aktuálního pololetí (nejvýš posledních 200 dní) do dneška. */
export function defaultImportRange() {
  const today = pragueNow().date;
  const p = currentPeriod();
  const start = periodRange(p.year, p.half).from;
  const min = addDays(today, -(IMPORT_MAX_DAYS - 1));
  return { from: start > min ? start : min, to: today };
}

export type { Entry };
