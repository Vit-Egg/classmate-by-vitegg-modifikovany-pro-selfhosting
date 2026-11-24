/**
 * Anonymní statistiky známek. Kdo to povolí, jeho číselné známky se (bez jména, e-mailu i třídy) započtou do průměru
 * u stejné písemky. Průměr se ukazuje všem, ale až když přispěli aspoň MIN_PEOPLE lidé, aby se nedal vyčíst jednotlivec.
 */
import { all, get, run, tx } from "./db";
import { hmac } from "./crypto";
import { fold } from "./text";
import type { MarksData } from "./types";
import type { User } from "./session";

import { MIN_DIST, MIN_PEOPLE } from "./stats-const";
export { MIN_DIST, MIN_PEOPLE };

export const markKey = (schoolId: number, subject: string, caption: string, date: string) => `${schoolId}|${fold(subject).trim()}|${fold(caption).trim()}|${date}`;
const contributor = (userId: number) => hmac(`marks-stats:${userId}`);
export const contributorOf = contributor;

export function contributeMarks(user: User, data: MarksData) {
  if (user.share_marks_stats !== 1) return;
  const who = contributor(user.id);
  const now = Date.now();
  tx(() => {
    for (const s of data.subjects)
      for (const m of s.marks) {
        if (m.value == null || !m.date) continue;
        run("INSERT INTO stat_marks (mark_key, contributor, value, weight, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (mark_key, contributor) DO UPDATE SET value = excluded.value, weight = excluded.weight, updated_at = excluded.updated_at", markKey(user.school_id, s.name, m.caption, m.date), who, m.value, m.weight || 1, now);
      }
  });
}

export function withdrawMarks(userId: number) {
  run("DELETE FROM stat_marks WHERE contributor = ?", contributor(userId));
}

/** Po povolení doplní příspěvky z už načtených známek. */
export function contributeFromCache(user: User) {
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'marks'", user.id);
  if (row) contributeMarks({ ...user, share_marks_stats: 1 }, JSON.parse(row.json));
}

export type MarkStat = { avg: number; n: number; /** kolik % ostatních má horší (vyšší) hodnotu než ty, stejná známka se nepočítá (jen když ostatních je dost a někoho předběhneš) */ better?: number };

/** Percentil: jaký podíl ostatních je na tom hůř (má vyšší číslo) než ty. Stejná známka se nepočítá (kdo má to samé, není „horší“), takže když mají všichni stejně, vyjde 0 %.
 *  Vrací celé procento, nebo undefined, když ostatních je málo nebo když by nikoho nepředběhl (0 % se neukazuje). */
export function betterThan(others: number[], mine: number): number | undefined {
  if (others.length < MIN_DIST - 1) return undefined;
  const worse = others.filter((v) => v > mine + 1e-9).length;
  const pct = Math.round((worse / others.length) * 100);
  return pct > 0 ? pct : undefined;
}

/** Průměry pro dané známky a tvůj percentil mezi ostatními; jen tam, kde přispěl dost lidí. */
export function markStats(user: User, data: MarksData) {
  const keys = new Map<string, { id: string; value: number }>(); // klíč → id a hodnota tvé známky
  for (const s of data.subjects) for (const m of s.marks) if (m.value != null && m.date) keys.set(markKey(user.school_id, s.name, m.caption, m.date), { id: m.id, value: m.value });
  const me = contributor(user.id);
  const out = new Map<string, MarkStat>();
  const list = [...keys.keys()];
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const per = new Map<string, { all: number[]; others: number[] }>();
    for (const r of all<{ mark_key: string; contributor: string; value: number }>(`SELECT mark_key, contributor, value FROM stat_marks WHERE mark_key IN (${chunk.map(() => "?").join(",")})`, ...chunk)) {
      const e = per.get(r.mark_key) ?? { all: [], others: [] };
      e.all.push(r.value);
      if (r.contributor !== me) e.others.push(r.value);
      per.set(r.mark_key, e);
    }
    for (const [k, e] of per) {
      if (e.all.length < MIN_PEOPLE) continue;
      const mine = keys.get(k)!;
      out.set(mine.id, { avg: e.all.reduce((a, b) => a + b, 0) / e.all.length, n: e.all.length, better: betterThan(e.others, mine.value) });
    }
  }
  return out;
}

/**
 * Průměr ostatních z jejich celkových osobních průměrů: každý, kdo sdílí známky a psal některou z tvých písemek (tedy spolužák), má celkový průměr
 * jako průměr svých průměrů jednotlivých předmětů (každý předmět váženě ze svých známek, všechny předměty stejně), a ty se zprůměrují.
 * Až od MIN_PEOPLE lidí, tvoje vlastní příspěvky se nepočítají.
 */
export function classPersonalAverage(user: User, data: MarksData, mine?: number | null): { avg: number; people: number; better?: number } | null {
  const me = contributor(user.id);
  const keys = new Set<string>();
  for (const s of data.subjects) for (const m of s.marks) if (m.value != null && m.date) keys.add(markKey(user.school_id, s.name, m.caption, m.date));
  const list = [...keys];
  const people = new Set<string>();
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    for (const r of all<{ contributor: string }>(`SELECT DISTINCT contributor FROM stat_marks WHERE mark_key IN (${chunk.map(() => "?").join(",")})`, ...chunk)) if (r.contributor !== me) people.add(r.contributor);
  }
  if (people.size < MIN_PEOPLE) return null;
  const ids = [...people];
  const avgs: number[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    // předmět je druhá část klíče (škola|předmět|písemka|datum); u každého člověka se spočítá vážený průměr předmětu a pak průměr předmětů
    const perPerson = new Map<string, Map<string, { sum: number; w: number }>>();
    for (const r of all<{ contributor: string; mark_key: string; value: number; weight: number }>(`SELECT contributor, mark_key, value, weight FROM stat_marks WHERE contributor IN (${chunk.map(() => "?").join(",")}) AND mark_key LIKE ?`, ...chunk, `${user.school_id}|%`)) {
      const subject = r.mark_key.split("|")[1] ?? "";
      const subjects = perPerson.get(r.contributor) ?? new Map<string, { sum: number; w: number }>();
      const e = subjects.get(subject) ?? { sum: 0, w: 0 };
      e.sum += r.value * r.weight;
      e.w += r.weight;
      subjects.set(subject, e);
      perPerson.set(r.contributor, subjects);
    }
    for (const subjects of perPerson.values()) {
      const per = [...subjects.values()].filter((e) => e.w > 0).map((e) => e.sum / e.w);
      if (per.length) avgs.push(per.reduce((a, b) => a + b, 0) / per.length);
    }
  }
  return avgs.length >= MIN_PEOPLE ? { avg: avgs.reduce((a, b) => a + b, 0) / avgs.length, people: avgs.length, better: mine != null ? betterThan(avgs, mine) : undefined } : null;
}

type HPoint = { subject: string; date: string; value: number; weight: number };

/** Celkový průměr (průměr vážených průměrů předmětů, každý předmět stejně) ze známek k danému dni včetně. */
function overallUpTo(pts: HPoint[], date: string): number | null {
  const subjects = new Map<string, { sum: number; w: number }>();
  for (const p of pts) {
    if (p.date > date) continue;
    const e = subjects.get(p.subject) ?? { sum: 0, w: 0 };
    e.sum += p.value * p.weight;
    e.w += p.weight;
    subjects.set(p.subject, e);
  }
  const per = [...subjects.values()].filter((e) => e.w > 0).map((e) => e.sum / e.w);
  return per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
}

export type AvgHistory = { dates: string[]; mine: (number | null)[]; cls: (number | null)[]; people: number; counts: number[] } | null;

/**
 * Vývoj celkového průměru tebe i ostatních v čase (ke každému dni z dat známek) a rozdělení známek ostatních.
 * Ostatní = ti, kdo anonymně sdílejí známky a psali některou z tvých písemek; průměr třídy se ukazuje až od tří lidí.
 */
export function averageHistory(user: User, data: MarksData): AvgHistory {
  const mineAll: HPoint[] = [];
  const keys = new Set<string>();
  for (const s of data.subjects)
    for (const m of s.marks) {
      if (m.value == null || !m.date) continue;
      mineAll.push({ subject: s.name, date: m.date, value: m.value, weight: m.weight || 1 });
      keys.add(markKey(user.school_id, s.name, m.caption, m.date));
    }
  const me = contributor(user.id);
  const list = [...keys];
  const people = new Set<string>();
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    for (const r of all<{ contributor: string }>(`SELECT DISTINCT contributor FROM stat_marks WHERE mark_key IN (${chunk.map(() => "?").join(",")})`, ...chunk)) if (r.contributor !== me) people.add(r.contributor);
  }
  const ids = [...people];
  const byPerson = new Map<string, HPoint[]>();
  const counts = [0, 0, 0, 0, 0, 0];
  if (ids.length >= MIN_PEOPLE) {
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      for (const r of all<{ contributor: string; mark_key: string; value: number; weight: number }>(`SELECT contributor, mark_key, value, weight FROM stat_marks WHERE contributor IN (${chunk.map(() => "?").join(",")}) AND mark_key LIKE ?`, ...chunk, `${user.school_id}|%`)) {
        const parts = r.mark_key.split("|");
        const date = parts[parts.length - 1];
        const arr = byPerson.get(r.contributor) ?? [];
        arr.push({ subject: parts[1] ?? "", date, value: r.value, weight: r.weight || 1 });
        byPerson.set(r.contributor, arr);
        counts[Math.min(5, Math.max(1, Math.round(r.value + 0.01))) - 1]++;
      }
    }
  }
  const dates = [...new Set([...mineAll.map((p) => p.date), ...[...byPerson.values()].flat().map((p) => p.date)])].sort();
  if (!dates.length) return null;
  const mine = dates.map((d) => overallUpTo(mineAll, d));
  const cls = dates.map((d) => {
    const avgs: number[] = [];
    for (const pts of byPerson.values()) {
      const a = overallUpTo(pts, d);
      if (a != null) avgs.push(a);
    }
    return avgs.length >= MIN_PEOPLE ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  });
  const ok = byPerson.size >= MIN_PEOPLE;
  return { dates, mine, cls: ok ? cls : dates.map(() => null), people: byPerson.size, counts: ok ? counts : [0, 0, 0, 0, 0, 0] };
}
