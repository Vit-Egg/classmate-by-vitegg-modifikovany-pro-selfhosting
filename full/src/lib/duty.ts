/**
 * Třídní služby: volitelný modul po třídách. Každý týden slouží dva lidé a losují se náhodně, ale spravedlivě po kolech:
 * dokud neodsloužili všichni, nikdo se neopakuje. Jakmile se kolo dočerpá (v jednom týdnu zbyl jen jeden), druhého
 * losuje už nové kolo. Týdny se losují dopředu na celé jedno kolo (aspoň aktuální a další tři) a po vylosování jsou pevné; přegenerovat je smí jen správce.
 */
import { randomInt } from "node:crypto";
import { all, get, run, tx } from "./db";
import { addDays, fmtShort, mondayOf, pragueNow } from "./dates";
import { notify } from "./messages";
import { audit, classTarget } from "./audit";
import type { User } from "./session";

export class DutyError extends Error {}
const fail = (m: string): never => {
  throw new DutyError(m);
};

export const PER_WEEK = 2;
/** Nejméně tolik týdnů dopředu se rozpis vždy vylosuje; dál se losuje, dokud nemá každý ve třídě aspoň jeden týden služby před sebou (tedy celé kolo dopředu). */
export const WEEKS_AHEAD = 4;

export const dutyEnabled = (classId: number) => !!get<{ d: number }>("SELECT duty_enabled d FROM classes WHERE id = ?", classId)?.d;

/** Týden, který se právě sleduje: o víkendu už ten příští (sobota a neděle školní týden nepatří). */
export const baseWeek = (now = pragueNow()) => (now.dow >= 6 ? addDays(mondayOf(now.date), 7) : mondayOf(now.date));

const eligible = (classId: number) => all<{ id: number }>("SELECT id FROM users WHERE class_id = ? AND duty_skip = 0 ORDER BY id", classId).map((r) => r.id);

function shuffledPick<T>(list: T[]): T {
  return list[randomInt(list.length)];
}

/** Vylosuje jeden týden (po kolech). Vrací vybrané lidi, nebo prázdné pole, když není z koho losovat. */
function drawWeek(classId: number, weekStart: string): { id: number; round: number }[] {
  const people = eligible(classId);
  const need = Math.min(PER_WEEK, people.length);
  if (!need) return [];
  let round = get<{ r: number | null }>("SELECT MAX(round) r FROM duty_weeks WHERE class_id = ?", classId)?.r ?? 1;
  const served = new Set(all<{ user_id: number }>("SELECT user_id FROM duty_weeks WHERE class_id = ? AND round = ?", classId, round).map((r) => r.user_id));
  let pool = people.filter((id) => !served.has(id));
  const chosen: { id: number; round: number }[] = [];
  while (chosen.length < need) {
    if (!pool.length) {
      round += 1; // kolo je vyčerpané, začíná nové (ten, kdo už je tento týden vybraný, v něm nesmí být podruhé)
      pool = people.filter((id) => !chosen.some((c) => c.id === id));
    }
    const id = shuffledPick(pool);
    pool = pool.filter((p) => p !== id);
    chosen.push({ id, round });
  }
  return chosen;
}

/**
 * Přečísluje kola od daného týdne dál podle toho, jak za sebou slouží lidé: kolo roste, kdykoli má někdo sloužit podruhé dřív, než kolo skončilo.
 * Opraví rozpis po ruční úpravě (kde se kolo nedá odhadnout z jednoho týdne) a drží kola konzistentní s losováním.
 */
export function renumberRounds(classId: number, from: string) {
  const prev = all<{ round: number; user_id: number }>("SELECT round, user_id FROM duty_weeks WHERE class_id = ? AND week_start < ?", classId, from);
  let cur = prev.reduce((m, r) => Math.max(m, r.round), 1);
  let served = new Set(prev.filter((r) => r.round === cur).map((r) => r.user_id));
  const rows = all<{ week_start: string; user_id: number }>("SELECT week_start, user_id FROM duty_weeks WHERE class_id = ? AND week_start >= ? ORDER BY week_start, user_id", classId, from);
  const weeks = new Map<string, number[]>();
  for (const r of rows) weeks.set(r.week_start, [...(weeks.get(r.week_start) ?? []), r.user_id]);
  const set = (week: string, id: number, round: number) => run("UPDATE duty_weeks SET round = ? WHERE class_id = ? AND week_start = ? AND user_id = ?", round, classId, week, id);
  for (const [week, ids] of weeks) {
    const fresh = ids.filter((x) => !served.has(x));
    const stale = ids.filter((x) => served.has(x));
    for (const id of fresh) {
      set(week, id, cur);
      served.add(id);
    }
    if (stale.length) {
      cur += 1; // kdo má sloužit podruhé, začíná nové kolo
      served = new Set();
      for (const id of stale) {
        set(week, id, cur);
        served.add(id);
      }
    }
  }
}

/** Doplní rozpis na aktuální a další týdny. Už vylosované týdny se nemění. Nově vylosovaným pošle oznámení. */
export function ensureSchedule(classId: number, now = pragueNow()): void {
  if (!dutyEnabled(classId)) return;
  const base = baseWeek(now);
  const created: { week: string; ids: number[] }[] = [];
  tx(() => {
    const people = eligible(classId);
    if (!people.length) return;
    renumberRounds(classId, base); // kola vždy sedí s tím, kdo za kým slouží (i po ruční úpravě rozpisu)
    // Týden, který vznikl, když byla ve třídě jen hrstka lidí (nebo z něj někdo odešel), zůstal s jedním člověkem.
    // Jakmile je lidí dost, budoucí neúplné týdny se vylosují znovu (po kolech, ať se nikdo zbytečně neopakuje) a v aktuálním týdnu se doplní druhý člověk.
    const want = Math.min(PER_WEEK, people.length);
    const byWeek = new Map<string, number[]>();
    for (const r of all<{ week_start: string; user_id: number }>("SELECT week_start, user_id FROM duty_weeks WHERE class_id = ? AND week_start >= ? ORDER BY week_start", classId, base)) byWeek.set(r.week_start, [...(byWeek.get(r.week_start) ?? []), r.user_id]);
    for (const [week, ids] of byWeek) {
      if (ids.length >= want || get("SELECT 1 FROM duty_skips WHERE class_id = ? AND week_start = ?", classId, week)) continue;
      if (week > base) {
        run("DELETE FROM duty_weeks WHERE class_id = ? AND week_start = ?", classId, week);
        continue;
      }
      const loads = new Map<number, number>();
      for (const [, v] of byWeek) for (const id of v) loads.set(id, (loads.get(id) ?? 0) + 1);
      while (ids.length < want) {
        const free = people.filter((id) => !ids.includes(id));
        if (!free.length) break;
        const least = Math.min(...free.map((id) => loads.get(id) ?? 0));
        const id = shuffledPick(free.filter((x) => (loads.get(x) ?? 0) === least));
        run("INSERT OR IGNORE INTO duty_weeks (class_id, week_start, user_id, round) VALUES (?, ?, ?, 0)", classId, week, id);
        ids.push(id);
      }
      created.push({ week, ids });
    }
    renumberRounds(classId, base);
    // dopředu se losuje, dokud nemá každý aspoň jeden týden služby před sebou (celé kolo), a nejméně WEEKS_AHEAD týdnů
    const covered = new Set(all<{ user_id: number }>("SELECT user_id FROM duty_weeks WHERE class_id = ? AND week_start >= ?", classId, base).map((r) => r.user_id));
    for (let i = 0; i < 100; i++) {
      if (i >= WEEKS_AHEAD && people.every((id) => covered.has(id))) break;
      const week = addDays(base, i * 7);
      if (get("SELECT 1 FROM duty_skips WHERE class_id = ? AND week_start = ?", classId, week)) continue;
      if (get("SELECT 1 FROM duty_weeks WHERE class_id = ? AND week_start = ? LIMIT 1", classId, week)) continue;
      const picked = drawWeek(classId, week);
      for (const p of picked) {
        run("INSERT OR IGNORE INTO duty_weeks (class_id, week_start, user_id, round) VALUES (?, ?, ?, ?)", classId, week, p.id, p.round);
        covered.add(p.id);
      }
      if (picked.length) created.push({ week, ids: picked.map((p) => p.id) });
    }
  });
  for (const c of created) tell(classId, c.week, c.ids, base);
}

const names = (ids: number[]) => new Map(all<{ id: number; name: string }>(`SELECT id, name FROM users WHERE id IN (${ids.map(() => "?").join(",") || "NULL"})`, ...ids).map((u) => [u.id, u.name]));

/** Oznámí vylosovaným lidem jejich službu (jednou za týden a člověka, opakované losování nespamuje). */
function tell(classId: number, week: string, ids: number[], base: string) {
  const nm = names(ids);
  for (const id of ids) {
    const partner = ids.filter((x) => x !== id).map((x) => nm.get(x)).filter(Boolean).join(", ");
    notify(id, {
      category: "duty",
      title: week === base ? "Tento týden máš třídní službu" : `Třídní služba od ${fmtShort(week)}`,
      body: partner ? `Služba s: ${partner}` : "Služba sám/sama",
      link: "/sluzby",
      key: `duty:${classId}:${week}:${id}`,
    });
  }
}

export type DutyWeek = { start: string; end: string; people: { id: number; name: string }[]; skipped: boolean; current: boolean };

/** Rozpis: poslední týdny (historie) a aktuální s příštími. */
export function schedule(classId: number, history = 6, now = pragueNow()): DutyWeek[] {
  ensureSchedule(classId, now);
  const base = baseWeek(now);
  const from = addDays(base, -history * 7);
  const rows = all<{ week_start: string; id: number; name: string }>(
    "SELECT d.week_start, u.id, u.name FROM duty_weeks d JOIN users u ON u.id = d.user_id WHERE d.class_id = ? AND d.week_start >= ? ORDER BY d.week_start, cz(u.name)",
    classId, from,
  );
  const skips = new Set(all<{ week_start: string }>("SELECT week_start FROM duty_skips WHERE class_id = ? AND week_start >= ?", classId, from).map((r) => r.week_start));
  const out: DutyWeek[] = [];
  const last = get<{ w: string | null }>("SELECT MAX(week_start) w FROM duty_weeks WHERE class_id = ?", classId)?.w ?? base;
  const ahead = Math.max(WEEKS_AHEAD, Math.round((new Date(`${last}T00:00:00Z`).getTime() - new Date(`${base}T00:00:00Z`).getTime()) / (7 * 86_400_000)) + 1);
  for (let i = -history; i < ahead; i++) {
    const start = addDays(base, i * 7);
    const people = rows.filter((r) => r.week_start === start).map((r) => ({ id: r.id, name: r.name }));
    if (i < 0 && !people.length && !skips.has(start)) continue; // dřív se nelosovalo, v historii prázdný týden nezobrazujeme
    out.push({ start, end: addDays(start, 4), people, skipped: skips.has(start), current: i === 0 });
  }
  return out;
}

/** Stav kola, které právě probíhá (podle aktuálního týdne, ne podle naplánovaných týdnů dopředu): kolik lidí už v něm sloužilo (včetně tohoto týdne) a kdo ještě ne. */
export function roundState(classId: number, now = pragueNow()) {
  const people = all<{ id: number; name: string }>("SELECT id, name FROM users WHERE class_id = ? AND duty_skip = 0 ORDER BY cz(name)", classId);
  const base = baseWeek(now);
  const round =
    get<{ r: number | null }>("SELECT MIN(round) r FROM duty_weeks WHERE class_id = ? AND week_start = ?", classId, base)?.r ??
    get<{ r: number | null }>("SELECT MAX(round) r FROM duty_weeks WHERE class_id = ? AND week_start <= ?", classId, base)?.r ??
    1;
  const served = new Set(all<{ user_id: number }>("SELECT user_id FROM duty_weeks WHERE class_id = ? AND round = ? AND week_start <= ?", classId, round, base).map((r) => r.user_id));
  const remaining = people.filter((p) => !served.has(p.id));
  return { round, total: people.length, served: people.length - remaining.length, remaining: remaining.map((p) => p.name) };
}

/** Kdo má službu tenhle týden (pro stránku Dnes). */
export function myDuty(user: Pick<User, "id" | "class_id">, now = pragueNow()): { weekStart: string; partners: string[] } | null {
  if (!dutyEnabled(user.class_id)) return null;
  ensureSchedule(user.class_id, now);
  const week = baseWeek(now);
  if (!get("SELECT 1 FROM duty_weeks WHERE class_id = ? AND week_start = ? AND user_id = ?", user.class_id, week, user.id)) return null;
  const partners = all<{ name: string }>("SELECT u.name FROM duty_weeks d JOIN users u ON u.id = d.user_id WHERE d.class_id = ? AND d.week_start = ? AND d.user_id != ? ORDER BY cz(u.name)", user.class_id, week, user.id).map((r) => r.name);
  return { weekStart: week, partners };
}

/** Aktuální dvojice (i pro lidi, kteří službu nemají), pro přehled na Dnes. */
export function thisWeek(classId: number, now = pragueNow()): string[] {
  if (!dutyEnabled(classId)) return [];
  ensureSchedule(classId, now);
  return all<{ name: string }>("SELECT u.name FROM duty_weeks d JOIN users u ON u.id = d.user_id WHERE d.class_id = ? AND d.week_start = ? ORDER BY cz(u.name)", classId, baseWeek(now)).map((r) => r.name);
}

/* ---------- správce ---------- */

const adminOnly = (user: Pick<User, "role">) => {
  if (user.role !== "admin") fail("Tohle smí jen správce.");
};

export function adminSetDuty(admin: User, classId: number, enabled: boolean) {
  adminOnly(admin);
  if (!get("SELECT 1 FROM classes WHERE id = ?", classId)) fail("Třída neexistuje.");
  run("UPDATE classes SET duty_enabled = ? WHERE id = ?", enabled ? 1 : 0, classId);
  if (enabled) ensureSchedule(classId);
  audit(admin, "module_change", { target: classTarget(classId), detail: `Třídní služby ${enabled ? "zapnuty" : "vypnuty"}` });
}

export function adminSetExempt(admin: User, classId: number, userId: number, exempt: boolean) {
  adminOnly(admin);
  const r = run("UPDATE users SET duty_skip = ? WHERE id = ? AND class_id = ?", exempt ? 1 : 0, userId, classId);
  if (!r.changes) fail("Uživatel není v téhle třídě.");
  // vynechaný člověk nemá mít službu v týdnech, které ještě nezačaly; budoucí rozpis se přelosuje
  regenerateFrom(classId, addDays(baseWeek(), 0), true);
  audit(admin, "duty_change", { targetUser: userId, target: classTarget(classId), detail: exempt ? "vynechán ze služeb" : "zařazen do služeb" });
}

/** Smaže rozpis od daného týdne dál (jen aktuální a budoucí) a vylosuje znovu. Kola se tím nikdy nepoškodí, protože se maže vždy souvislý konec. */
function regenerateFrom(classId: number, weekStart: string, keepCurrent = false) {
  const base = baseWeek();
  const from = weekStart < base ? base : weekStart;
  const start = keepCurrent && from === base ? addDays(base, 7) : from;
  tx(() => run("DELETE FROM duty_weeks WHERE class_id = ? AND week_start >= ?", classId, start));
  ensureSchedule(classId);
}

export function adminReroll(admin: User, classId: number, weekStart: string) {
  adminOnly(admin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOf(weekStart) !== weekStart) fail("Neplatný týden.");
  if (weekStart < baseWeek()) fail("Minulý týden už změnit nejde.");
  regenerateFrom(classId, weekStart);
  audit(admin, "duty_change", { target: classTarget(classId), detail: `přelosováno od ${weekStart}` });
}

/**
 * Ruční určení, kdo má službu v daném týdnu (aktuálním nebo budoucím): nahradí losem určenou dvojici. Pomůže přesunout lidi mezi týdny
 * (nastaví se oba týdny). Kolo se u každého určí podle toho, jestli už v aktuálním kole sloužil. Zrušené volno se tím odstraní.
 * Nově přiřazení dostanou oznámení, odebraným přijde zpráva o zrušení.
 */
export function adminSetWeek(admin: User, classId: number, weekStart: string, userIds: number[]) {
  adminOnly(admin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOf(weekStart) !== weekStart) fail("Neplatný týden.");
  if (weekStart < baseWeek()) fail("Minulý týden už změnit nejde.");
  const ids = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
  if (!ids.length) fail("Vyber aspoň jednoho člověka, nebo týden označ jako volno.");
  const members = new Set(all<{ id: number }>("SELECT id FROM users WHERE class_id = ?", classId).map((r) => r.id));
  if (!ids.every((id) => members.has(id))) fail("Vybraný člověk není v téhle třídě.");
  const before = all<{ user_id: number }>("SELECT user_id FROM duty_weeks WHERE class_id = ? AND week_start = ?", classId, weekStart).map((r) => r.user_id);
  tx(() => {
    run("DELETE FROM duty_skips WHERE class_id = ? AND week_start = ?", classId, weekStart);
    run("DELETE FROM duty_weeks WHERE class_id = ? AND week_start = ?", classId, weekStart);
    for (const id of ids) run("INSERT INTO duty_weeks (class_id, week_start, user_id, round) VALUES (?, ?, ?, 0)", classId, weekStart, id);
    renumberRounds(classId, baseWeek()); // kola se dopočítají podle toho, kdo za kým slouží
  });
  const base = baseWeek();
  tell(classId, weekStart, ids, base);
  for (const id of before.filter((b) => !ids.includes(b))) {
    notify(id, { category: "duty", title: `Služba od ${fmtShort(weekStart)} ti byla zrušena`, body: "Správce změnil rozpis třídních služeb.", link: "/sluzby", key: `dutyoff:${classId}:${weekStart}:${id}:${Date.now()}` });
  }
  ensureSchedule(classId); // doplní případné další týdny
  audit(admin, "duty_change", { target: classTarget(classId), detail: `týden ${weekStart} určen ručně (${ids.length} lidí)` });
}

export function adminSkipWeek(admin: User, classId: number, weekStart: string, skip: boolean) {
  adminOnly(admin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOf(weekStart) !== weekStart) fail("Neplatný týden.");
  if (weekStart < baseWeek()) fail("Minulý týden už změnit nejde.");
  tx(() => {
    if (skip) run("INSERT OR IGNORE INTO duty_skips (class_id, week_start) VALUES (?, ?)", classId, weekStart);
    else run("DELETE FROM duty_skips WHERE class_id = ? AND week_start = ?", classId, weekStart);
  });
  regenerateFrom(classId, weekStart);
  audit(admin, "duty_change", { target: classTarget(classId), detail: `týden ${weekStart} ${skip ? "bez služby" : "se službou"}` });
}

/** Pro pozadí: doplní rozpis všem třídám se zapnutými službami (aby oznámení chodila i bez otevření aplikace). */
export function ensureAllSchedules() {
  for (const c of all<{ id: number }>("SELECT id FROM classes WHERE duty_enabled = 1")) ensureSchedule(c.id);
}
