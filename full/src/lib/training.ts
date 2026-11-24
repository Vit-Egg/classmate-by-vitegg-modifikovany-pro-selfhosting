/**
 * Tréninkový deník pro program Aktivní sportovec: žák zapisuje aktivity a týdenní reflexe (ručně nebo z Intervals.icu)
 * a výsledek stáhne jako tabulku, kterou škola vyžaduje (viz training-export.ts). Škola modul povoluje, každý žák si ho zapíná sám.
 */
import { addDays, mondayOf, pragueNow } from "./dates";
import { all, get, run } from "./db";
import type { User } from "./session";

export class TrainingError extends Error {}
const fail = (m: string): never => {
  throw new TrainingError(m);
};

/** Typy aktivit z tabulky (stejné hodnoty jako v jejím výběru). */
export const TYPES = ["Trénink", "Individuální trénink", "Kondiční příprava", "Zápas", "Závod", "Regenerace", "Volno", "Jiná aktivita"] as const;
/** Tabulka pojme 160 zápisů a 24 týdenních reflexí na pololetí. */
export const MAX_ENTRIES = 160;
export const MAX_REFLECTIONS = 24;

export type Profile = { sport: string; club: string; category: string; frequency: string; teacher: string; submit1: string; submit2: string };
export type Entry = { id: number; date: string; type: string; minutes: number; rpe: number | null; content: string; goal: string; note: string; source: string };
export type Reflection = { id: number; week_from: string; week_to: string; goal: string; achieved: string; improve: string; rating: number | null; filled_on: string };

/* ---------- školní rok a pololetí ---------- */

/** Školní rok začíná 1. září: 1. pololetí je září až leden, 2. pololetí únor až srpen. */
export function periodOf(date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return { year: m >= 9 ? y : y - 1, half: (m >= 9 || m === 1 ? 1 : 2) as 1 | 2 };
}
export const yearLabel = (year: number) => `${year}/${year + 1}`;
export function periodRange(year: number, half: 1 | 2) {
  return half === 1 ? { from: `${year}-09-01`, to: `${year + 1}-01-31` } : { from: `${year + 1}-02-01`, to: `${year + 1}-08-31` };
}
export const currentPeriod = () => periodOf(pragueNow().date);

/* ---------- zapnutí ---------- */

export const schoolTrainingEnabled = (schoolId: number) => !!get<{ t: number }>("SELECT training_enabled t FROM schools WHERE id = ?", schoolId)?.t;
/** Modul je u žáka vidět, jen když ho škola povolila a žák si ho zapnul. */
export const trainingActive = (user: Pick<User, "id" | "school_id">) =>
  schoolTrainingEnabled(user.school_id) && !!get("SELECT 1 FROM training_profiles WHERE user_id = ? AND enabled = 1", user.id);

export function setSchoolTraining(schoolId: number, on: boolean) {
  if (!get("SELECT 1 FROM schools WHERE id = ?", schoolId)) fail("Škola neexistuje.");
  run("UPDATE schools SET training_enabled = ? WHERE id = ?", on ? 1 : 0, schoolId);
}

export function setTrainingEnabled(user: User, on: boolean) {
  if (on) {
    if (!schoolTrainingEnabled(user.school_id)) fail("Tréninkový deník tvoje škola nepovolila.");
    run("INSERT INTO training_profiles (user_id, enabled, created_at) VALUES (?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET enabled = 1", user.id, Date.now());
  } else run("UPDATE training_profiles SET enabled = 0 WHERE user_id = ?", user.id); // záznamy zůstávají, po novém zapnutí jsou zpět
}

/* ---------- údaje o sportovci ---------- */

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const isoOrEmpty = (v: unknown) => {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : "";
};

export const getProfile = (userId: number): Profile =>
  get<Profile>("SELECT sport, club, category, frequency, teacher, submit1, submit2 FROM training_profiles WHERE user_id = ?", userId) ?? { sport: "", club: "", category: "", frequency: "", teacher: "", submit1: "", submit2: "" };

export function saveProfile(user: User, input: Record<string, unknown>) {
  run(
    "UPDATE training_profiles SET sport = ?, club = ?, category = ?, frequency = ?, teacher = ?, submit1 = ?, submit2 = ? WHERE user_id = ?",
    clean(input.sport, 120), clean(input.club, 120), clean(input.category, 80), clean(input.frequency, 120), clean(input.teacher, 120), isoOrEmpty(input.submit1), isoOrEmpty(input.submit2), user.id,
  );
}

/* ---------- zápisy aktivit ---------- */

function parseEntry(input: Record<string, unknown>) {
  const date = isoOrEmpty(input.date);
  if (!date) fail("Zadej datum.");
  const today = pragueNow().date;
  if (date > addDays(today, 1)) fail("Do budoucnosti zapisovat nejde.");
  if (date < addDays(today, -800)) fail("Tohle datum je moc staré.");
  const type = String(input.type ?? "");
  if (!(TYPES as readonly string[]).includes(type)) fail("Vyber typ aktivity.");
  const minutes = Math.round(Number(String(input.minutes ?? "").replace(",", ".")));
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) fail("Délka je počet minut (0 až 1440).");
  if (minutes === 0 && type !== "Volno" && type !== "Regenerace") fail("Napiš délku v minutách.");
  const rpeRaw = String(input.rpe ?? "").trim();
  const rpe = rpeRaw === "" ? null : Math.round(Number(rpeRaw));
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) fail("Náročnost (RPE) je číslo od 1 do 10.");
  return { date, type, minutes, rpe, content: clean(input.content, 1500), goal: clean(input.goal, 600), note: clean(input.note, 1500) };
}

const countIn = (userId: number, year: number, half: 1 | 2) => {
  const r = periodRange(year, half);
  return get<{ n: number }>("SELECT COUNT(*) n FROM training_entries WHERE user_id = ? AND date BETWEEN ? AND ?", userId, r.from, r.to)!.n;
};

export function addEntry(user: User, input: Record<string, unknown>, source = "manual", extId: string | null = null) {
  const v = parseEntry(input);
  const p = periodOf(v.date);
  if (countIn(user.id, p.year, p.half) >= MAX_ENTRIES) fail(`V tomhle pololetí už máš ${MAX_ENTRIES} zápisů, víc se jich do tabulky nevejde.`);
  const now = Date.now();
  return Number(run("INSERT INTO training_entries (user_id, date, type, minutes, rpe, content, goal, note, source, ext_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", user.id, v.date, v.type, v.minutes, v.rpe, v.content, v.goal, v.note, source, extId, now, now).lastInsertRowid);
}

export function updateEntry(user: User, id: number, input: Record<string, unknown>) {
  const cur = get<{ date: string }>("SELECT date FROM training_entries WHERE id = ? AND user_id = ?", id, user.id);
  if (!cur) fail("Zápis neexistuje.");
  const v = parseEntry(input);
  const a = periodOf(cur!.date);
  const b = periodOf(v.date);
  if ((a.year !== b.year || a.half !== b.half) && countIn(user.id, b.year, b.half) >= MAX_ENTRIES) fail(`V pololetí, kam zápis přesouváš, už je ${MAX_ENTRIES} zápisů.`);
  run("UPDATE training_entries SET date = ?, type = ?, minutes = ?, rpe = ?, content = ?, goal = ?, note = ?, updated_at = ? WHERE id = ? AND user_id = ?", v.date, v.type, v.minutes, v.rpe, v.content, v.goal, v.note, Date.now(), id, user.id);
}

export const deleteEntry = (user: User, id: number) => void run("DELETE FROM training_entries WHERE id = ? AND user_id = ?", id, user.id);

export const listEntries = (userId: number, year: number, half: 1 | 2) => {
  const r = periodRange(year, half);
  return all<Entry>("SELECT id, date, type, minutes, rpe, content, goal, note, source FROM training_entries WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id", userId, r.from, r.to);
};

/** Souhrn stejný jako v hlavičce listu deníku: celkem minut, tréninky a soutěže (bez volna a regenerace), zápasy a závody, průměrné RPE. */
export function summarize(entries: Entry[]) {
  const rpes = entries.filter((e) => e.rpe !== null).map((e) => e.rpe!);
  const minutes = entries.reduce((n, e) => n + e.minutes, 0);
  return {
    count: entries.length,
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    trainings: entries.filter((e) => e.type !== "Volno" && e.type !== "Regenerace").length,
    matches: entries.filter((e) => e.type === "Zápas" || e.type === "Závod").length,
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
  };
}

/** Roky, pro které má žák nějaký zápis, plus aktuální. */
export function trainingYears(userId: number) {
  const ys = new Set(all<{ date: string }>("SELECT date FROM training_entries WHERE user_id = ? UNION SELECT week_from FROM training_reflections WHERE user_id = ?", userId, userId).map((r) => periodOf(r.date).year));
  ys.add(currentPeriod().year);
  return [...ys].sort((a, b) => b - a);
}

/* ---------- týdenní reflexe ---------- */

export const listReflections = (userId: number, year: number, half: 1 | 2) => {
  const r = periodRange(year, half);
  return all<Reflection>("SELECT id, week_from, week_to, goal, achieved, improve, rating, filled_on FROM training_reflections WHERE user_id = ? AND week_from BETWEEN ? AND ? ORDER BY week_from", userId, r.from, r.to);
};

/** Týden (pondělí až neděle) a počty z deníku, které se k němu v tabulce dopočítávají. */
export function weekStats(userId: number, from: string, to: string) {
  return get<{ n: number; m: number }>(
    "SELECT COUNT(*) n, COALESCE(SUM(minutes), 0) m FROM training_entries WHERE user_id = ? AND date BETWEEN ? AND ? AND type NOT IN ('Volno', 'Regenerace')",
    userId, from, to,
  )!;
}

export function saveReflection(user: User, id: number | null, input: Record<string, unknown>) {
  const from = isoOrEmpty(input.week);
  if (!from) fail("Vyber týden.");
  const monday = mondayOf(from);
  const rating = String(input.rating ?? "") === "" ? null : Math.round(Number(input.rating));
  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) fail("Sebehodnocení je číslo od 1 do 5.");
  const v = { goal: clean(input.goal, 600), achieved: clean(input.achieved, 1500), improve: clean(input.improve, 1500) };
  if (!v.goal && !v.achieved && !v.improve) fail("Napiš aspoň krátké zhodnocení týdne.");
  const p = periodOf(monday);
  const r = periodRange(p.year, p.half);
  const dup = get<{ id: number }>("SELECT id FROM training_reflections WHERE user_id = ? AND week_from = ? AND id != ?", user.id, monday, id ?? 0);
  if (dup) fail("Reflexi za tenhle týden už máš, otevři ji a uprav.");
  const today = pragueNow().date;
  if (id) {
    if (!get("SELECT 1 FROM training_reflections WHERE id = ? AND user_id = ?", id, user.id)) fail("Reflexe neexistuje.");
    run("UPDATE training_reflections SET week_from = ?, week_to = ?, goal = ?, achieved = ?, improve = ?, rating = ? WHERE id = ? AND user_id = ?", monday, addDays(monday, 6), v.goal, v.achieved, v.improve, rating, id, user.id);
    return;
  }
  const n = get<{ n: number }>("SELECT COUNT(*) n FROM training_reflections WHERE user_id = ? AND week_from BETWEEN ? AND ?", user.id, r.from, r.to)!.n;
  if (n >= MAX_REFLECTIONS) fail(`V tomhle pololetí už máš ${MAX_REFLECTIONS} reflexí, víc se jich do tabulky nevejde.`);
  run("INSERT INTO training_reflections (user_id, week_from, week_to, goal, achieved, improve, rating, filled_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", user.id, monday, addDays(monday, 6), v.goal, v.achieved, v.improve, rating, today, Date.now());
}

export const deleteReflection = (user: User, id: number) => void run("DELETE FROM training_reflections WHERE id = ? AND user_id = ?", id, user.id);
