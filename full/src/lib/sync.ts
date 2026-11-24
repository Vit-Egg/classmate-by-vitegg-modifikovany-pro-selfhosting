import { all, get, run, tx } from "./db";
import { decrypt, encrypt } from "./crypto";
import { BakalariError, bkGet, bkRefresh } from "./bakalari";
import { normalizeAbsence, normalizeFinal, normalizeHomework, normalizeMarks, normalizeTimetable } from "./normalize";
import { addDays, mondayOf, pragueNow } from "./dates";
import { contributeMarks } from "./stats";
import { detectAbsence, detectMarks, detectTimetable, notify } from "./messages";
import type { AbsenceData, CacheResult, FinalData, HomeworkData, Hue, MarksData, Timetable } from "./types";
import { demoData } from "./demo";
import type { User } from "./session";
import { audit } from "./audit";
import { bakalariName, memberNamed, rosterAdd, rosterRemove } from "./roster";

const HUES: Hue[] = ["gray", "purple", "green", "amber", "blue"];
const hueFor = (name: string) => HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/** Zvyš při změně tvaru uloženého rozvrhu, ať se stará cache nepoužije. */
const TT_V = "2";

const TTL = { actual: 5 * 60_000, permanent: 6 * 3600_000, marks: 5 * 60_000 };

/* ---------- přístupové tokeny ---------- */

const accessTokens = new Map<number, { token: string; exp: number }>();
const authFails = new Map<number, { n: number; since: number }>();
const locks = new Map<number, Promise<unknown>>();

/** Refresh tokeny Bakalářů se po každém použití otáčejí, proto obnova běží v jednom proudu na uživatele. */
function serialized<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const next = (locks.get(userId) ?? Promise.resolve()).catch(() => {}).then(fn);
  locks.set(userId, next);
  return next;
}

export function rememberTokens(userId: number, access: string, expiresIn: number) {
  accessTokens.set(userId, { token: access, exp: Date.now() + (expiresIn - 60) * 1000 });
}

async function accessToken(user: User) {
  return serialized(user.id, async () => {
    const cached = accessTokens.get(user.id);
    if (cached && cached.exp > Date.now()) return cached.token;
    const row = get<{ bakalari_refresh_enc: string | null }>("SELECT bakalari_refresh_enc FROM users WHERE id = ?", user.id);
    if (!row?.bakalari_refresh_enc || !user.bakalari_url) throw new BakalariError("Bakaláři nejsou připojeny.", "config");
    try {
      const t = await bkRefresh(user.bakalari_url, decrypt(row.bakalari_refresh_enc));
      run("UPDATE users SET bakalari_refresh_enc = ? WHERE id = ?", encrypt(t.refresh_token), user.id);
      rememberTokens(user.id, t.access_token, t.expires_in);
      authFails.delete(user.id);
      return t.access_token;
    } catch (e) {
      if (e instanceof BakalariError && e.kind === "auth") {
        // Jedno odmítnutí ještě neznamená, že propojení skončilo (výpadek Bakalářů, souběh dvou obnovení při nasazení). Odpojí se až po opakovaných odmítnutích.
        const f = authFails.get(user.id) ?? { n: 0, since: Date.now() };
        f.n++;
        authFails.set(user.id, f);
        if (f.n >= 3 && Date.now() - f.since >= 20 * 60_000) {
          authFails.delete(user.id);
          run("UPDATE users SET bakalari_refresh_enc = NULL WHERE id = ?", user.id);
          accessTokens.delete(user.id);
          notify(user.id, { category: "system", title: "Propojení s Bakaláři vypršelo", body: "Přihlas se k Bakalářům znovu v Nastavení → Propojení, jinak ti nebudou chodit oznámení.", link: "/nastaveni?k=propojeni", key: `bk-disc:${new Date().toISOString().slice(0, 10)}` });
          throw e;
        }
        throw new BakalariError("Bakaláři teď přihlášení neověřily, zkusím to znovu.", "network");
      }
      throw e;
    }
  });
}

/** Pro moduly, které volají Bakaláře jinak než GETem (Komens). */
export const accessTokenFor = (user: User) => accessToken(user);
export const getCachedBox = <T,>(user: User, key: string, force: boolean, fetcher: (token: string) => Promise<T>, after?: (data: T, prev: T | null) => void) =>
  cached<T>(user, key, 5 * 60_000, async () => fetcher(await accessToken(user)), force, after);

async function bk<T = any>(user: User, path: string) {
  return bkGet<T>(user.bakalari_url!, await accessToken(user), path);
}

/* ---------- cache ---------- */

/** Jak dlouho po vypršení platnosti se ještě smí ukázat stará kopie (a obnovit na pozadí), místo aby stránka čekala na Bakaláře. */
const STALE_MAX = 12 * 3600_000;
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(user: User, key: string, ttl: number, fetcher: () => Promise<T>, force = false, after?: (data: T, prev: T | null) => void): Promise<CacheResult<T>> {
  if (user.demo) {
    const d = demoData(key); // ukázkový účet: vymyšlená data, Bakaláře se nevolají
    if (d !== undefined) return { data: d as T, stale: false, fetchedAt: Date.now() };
  }
  const row = get<{ json: string; fetched_at: number }>("SELECT json, fetched_at FROM cache WHERE user_id = ? AND key = ?", user.id, key);
  const age = row ? Date.now() - row.fetched_at : Infinity;

  const refresh = async (): Promise<CacheResult<T>> => {
    try {
      const data = await fetcher();
      const now = Date.now();
      run("INSERT OR REPLACE INTO cache (user_id, key, json, fetched_at) VALUES (?, ?, ?, ?)", user.id, key, JSON.stringify(data), now);
      run("UPDATE users SET last_sync_at = ? WHERE id = ?", now, user.id); // počítá se každé úspěšné načtení z Bakalářů, i automatické na pozadí
      try {
        after?.(data, row ? (JSON.parse(row.json) as T) : null); // porovnání s předchozí verzí → zprávy
      } catch (e) {
        console.error("message detection failed", key, e);
      }
      return { data, stale: false, fetchedAt: now };
    } catch (e) {
      const error = e instanceof BakalariError ? (e.kind === "auth" || e.kind === "config" ? "disconnected" : "network") : "network";
      if (row) return { data: JSON.parse(row.json), stale: true, error, fetchedAt: row.fetched_at };
      return { data: null, stale: true, error };
    }
  };

  // stejné načtení běží jen jednou: víc oken, požadavků a synchronizace na pozadí si počkají na jeden dotaz na Bakaláře
  const id = `${user.id}:${key}`;
  const shared = (fn: () => Promise<CacheResult<T>>) => {
    let p = inflight.get(id) as Promise<CacheResult<T>> | undefined;
    if (!p) inflight.set(id, (p = fn().finally(() => inflight.delete(id))));
    return p;
  };

  if (row && age < ttl && !force) return { data: JSON.parse(row.json), stale: false, fetchedAt: row.fetched_at };

  // stará kopie hned, obnova běží na pozadí (stránka se neotevírá pomalu; nová data jsou při dalším otevření)
  if (row && age < STALE_MAX && !force) {
    shared(refresh);
    return { data: JSON.parse(row.json), stale: false, fetchedAt: row.fetched_at };
  }
  return shared(refresh);
}

/* ---------- rozvrh ---------- */

export type TimetableKind = "this" | "next" | "permanent";

export function weekMonday(kind: TimetableKind) {
  const today = pragueNow().date;
  return mondayOf(kind === "next" ? addDays(today, 7) : today);
}

export async function getTimetable(user: User, kind: TimetableKind, force = false) {
  if (kind === "permanent") {
    return cached<Timetable>(
      user,
      `tt${TT_V}:permanent`,
      TTL.permanent,
      async () => {
        const tt = normalizeTimetable(await bk(user, "/api/3/timetable/permanent"));
        mapSubjects(user, tt);
        return tt;
      },
      force,
    );
  }
  return getTimetableWeek(user, weekMonday(kind), force);
}

/** Rozvrh týdne začínajícího daným pondělím (pro kalendář i „tento/příští týden“). */
export async function getTimetableWeek(user: User, monday: string, force = false) {
  return cached<Timetable>(user, `tt${TT_V}:${monday}`, TTL.actual, async () => normalizeTimetable(await bk(user, `/api/3/timetable/actual?date=${monday}`)), force, (data, prev) => detectTimetable(user, monday, data, prev));
}

/** Předměty a skupiny uživatele podle stálého rozvrhu (Bakaláři vrací jen to, co se ho týká). */
export function mapSubjects(user: User, tt: Timetable) {
  const classNameNorm = user.class_name.trim().toLowerCase();
  const sorted = [...tt.lessons].filter((l) => l.subjectId).sort((a, b) => a.day - b.day || a.hour - b.hour);
  tx(() => {
    const subjectName = new Map(tt.subjects.map((s) => [s.id, s]));
    const groupMeta = new Map(tt.groups.map((g) => [g.id, g]));
    const upsertSubject = (bk_id: string) => {
      const s = subjectName.get(bk_id);
      if (!s) return null;
      run("INSERT INTO subjects (class_id, bk_id, name, abbrev, hue) VALUES (?, ?, ?, ?, ?) ON CONFLICT (class_id, bk_id) DO UPDATE SET name = excluded.name, abbrev = excluded.abbrev", user.class_id, bk_id, s.name, s.abbrev, hueFor(s.name));
      return get<{ id: number }>("SELECT id FROM subjects WHERE class_id = ? AND bk_id = ?", user.class_id, bk_id)!.id;
    };
    const upsertGroup = (bk_id: string) => {
      const g = groupMeta.get(bk_id);
      const whole = bk_id === "__class__" || !g || g.name === g.abbrev || g.name.trim().toLowerCase() === classNameNorm;
      const label = !g ? user.class_name : g.name === g.abbrev ? g.name : `${g.abbrev} ${g.name}`;
      run("INSERT INTO groups (class_id, bk_id, label, whole_class) VALUES (?, ?, ?, ?) ON CONFLICT (class_id, bk_id) DO UPDATE SET label = excluded.label, whole_class = excluded.whole_class", user.class_id, bk_id, label, whole ? 1 : 0);
      return get<{ id: number }>("SELECT id FROM groups WHERE class_id = ? AND bk_id = ?", user.class_id, bk_id)!.id;
    };

    run("DELETE FROM user_subjects WHERE user_id = ?", user.id);
    // Třídu necháváme vždy v seznamu skupin, i když v rozvrhu není žádná „celotřídní“ hodina.
    upsertGroup("__class__");
    let position = 0;
    for (const l of sorted) {
      const sid = upsertSubject(l.subjectId);
      if (sid == null) continue;
      for (const gid of l.groups.length ? l.groups : ["__class__"]) {
        run("INSERT OR IGNORE INTO user_subjects (user_id, subject_id, group_id, position) VALUES (?, ?, ?, ?)", user.id, sid, upsertGroup(gid), position++);
      }
    }
  });
}

export async function getMarks(user: User, force = false) {
  return cached<MarksData>(
    user,
    "marks",
    TTL.marks,
    async () => {
      const data = normalizeMarks(await bk(user, "/api/3/marks"));
      contributeMarks(user, data); // jen když uživatel souhlasil
      return data;
    },
    force,
    (data, prev) => detectMarks(user, data, prev),
  );
}

export async function getAbsence(user: User, force = false) {
  return cached<AbsenceData>(user, "absence", TTL.marks, async () => normalizeAbsence(await bk(user, "/api/3/absence/student")), force, (data, prev) => detectAbsence(user, data, prev));
}

/** Domácí úkoly z Bakalářů (jen čtení): zadané nebo s termínem od dvou týdnů zpět do více než roku dopředu (dlouhodobé úkoly mají termín i za několik měsíců). */
export async function getHomework(user: User, force = false) {
  const today = pragueNow().date;
  return cached<HomeworkData>(user, "homework2", TTL.marks, async () => normalizeHomework(await bk(user, `/api/3/homeworks?from=${addDays(today, -14)}&to=${addDays(today, 400)}`)), force);
}

/** Vysvědčení z Bakalářů (jen čtení): konečné známky za pololetí. Když to škola nemá zapnuté, vrací se chyba a stránka sekci nezobrazí. */
export async function getFinal(user: User, force = false) {
  return cached<FinalData>(user, "final1", TTL.marks, async () => normalizeFinal(await bk(user, "/api/3/marks/final")), force);
}

/**
 * Jméno i třída v aplikaci jsou vždy z Bakalářů: porovná se při první synchronizaci a pak jednou týdně.
 * Změněné jméno se přepíše. Změněná třída (nový školní rok) se přesune, když ve škole existuje, nebo když škola povoluje všechny třídy
 * (pak se založí); jinak student zůstane ve staré třídě a rozhodne správce. Vrací aktuální podobu uživatele.
 */
async function syncProfile(user: User): Promise<User> {
  if (user.demo) return user;
  const due = get<{ t: number | null }>("SELECT bk_profile_at t FROM users WHERE id = ?", user.id)?.t;
  if (due && Date.now() - due < 7 * 86_400_000) return user;
  try {
    const me = await bk<{ FullName?: string; Class?: { Abbrev?: string } }>(user, "/api/3/user");
    const name = bakalariName(me.FullName ?? "");
    if (name && name !== user.name) run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
    run("UPDATE users SET bk_profile_at = ? WHERE id = ?", Date.now(), user.id);

    const abbrev = (me.Class?.Abbrev ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();
    if (abbrev && norm(abbrev) !== norm(user.class_name)) {
      const found = (get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND lower(replace(name, ' ', '')) = ?", user.school_id, norm(abbrev))?.id)
        ?? (get<{ any_class: number }>("SELECT any_class FROM schools WHERE id = ?", user.school_id)?.any_class
          ? (run("INSERT OR IGNORE INTO classes (school_id, name) VALUES (?, ?)", user.school_id, abbrev), get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND lower(replace(name, ' ', '')) = ?", user.school_id, norm(abbrev))?.id)
          : undefined);
      const nameNow = name || user.name;
      if (found && found !== user.class_id && !memberNamed(found, nameNow)) {
        tx(() => {
          rosterRemove(user.class_id, user.name);
          rosterAdd(found, nameNow);
          run("UPDATE users SET class_id = ?, treasurer = 0 WHERE id = ?", found, user.id); // role pokladníka patří k třídě
          run("DELETE FROM user_subjects WHERE user_id = ?", user.id);
          run("DELETE FROM cache WHERE user_id = ?", user.id);
        });
        audit({ id: user.id, name: nameNow }, "class_auto_move", { detail: `z ${user.class_name} do ${abbrev} (podle Bakalářů)` });
      }
    }
    const { USER_SELECT } = await import("./session");
    return get<User>(`${USER_SELECT} WHERE u.id = ?`, user.id) ?? user;
  } catch {
    return user; // doplněk: když Bakaláři neodpoví, zkusí se to při další synchronizaci
  }
}

/** Načte vše a uloží čas poslední synchronizace. */
export async function syncAll(user: User, force = true) {
  user = await syncProfile(user);
  const perm = await getTimetable(user, "permanent", force);
  const results = await Promise.all([getTimetable(user, "this", force), getTimetable(user, "next", force), getMarks(user, force), getAbsence(user, force)]);
  void getFinal(user, force).catch(() => {});
  void getHomework(user, force).catch(() => {}); // doplněk: když ho škola nemá zapnutý, synchronizace kvůli tomu neselže
  const ok = !perm.error && results.every((r) => !r.error);
  if (ok) run("UPDATE users SET last_sync_at = ? WHERE id = ?", Date.now(), user.id);
  run("DELETE FROM cache WHERE user_id = ? AND fetched_at < ?", user.id, Date.now() - 30 * 86_400_000);
  return { ok, error: perm.error ?? results.find((r) => r.error)?.error };
}

/* ---------- předměty a skupiny uživatele ---------- */

export type SubjectRow = { id: number; name: string; abbrev: string; hue: Hue };
export type GroupRow = { id: number; label: string; whole_class: number };

export type SubjectRowFull = SubjectRow & { bk_id: string };

export const userSubjects = (userId: number) =>
  all<SubjectRowFull>("SELECT s.id, s.bk_id, s.name, s.abbrev, s.hue FROM user_subjects us JOIN subjects s ON s.id = us.subject_id WHERE us.user_id = ? GROUP BY s.id ORDER BY MIN(us.position)", userId);

export const userGroups = (userId: number) =>
  all<GroupRow & { subjects: string }>(
    `SELECT g.id, g.label, g.whole_class, COALESCE(GROUP_CONCAT(DISTINCT s.name), '') AS subjects
     FROM user_subjects us JOIN groups g ON g.id = us.group_id JOIN subjects s ON s.id = us.subject_id
     WHERE us.user_id = ? GROUP BY g.id ORDER BY g.whole_class DESC, g.label`,
    userId,
  );

export const subjectGroups = (userId: number, subjectId: number) =>
  all<GroupRow>("SELECT g.id, g.label, g.whole_class FROM user_subjects us JOIN groups g ON g.id = us.group_id WHERE us.user_id = ? AND us.subject_id = ? ORDER BY g.whole_class DESC", userId, subjectId);

/** Jen z cache, bez sítě – pro prvky, které nesmí zdržovat vykreslení stránky. */
export function peekTimetable(user: User, kind: TimetableKind): Timetable | null {
  if (user.demo) return demoData(kind === "permanent" ? `tt${TT_V}:permanent` : `tt${TT_V}:${weekMonday(kind)}`) as Timetable;
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = ?", user.id, kind === "permanent" ? `tt${TT_V}:permanent` : `tt${TT_V}:${weekMonday(kind)}`);
  return row ? (JSON.parse(row.json) as Timetable) : null;
}

/** Poslední stažená absence z paměti (bez sítě); pro ukázkový účet vygenerovaná. */
export function peekAbsence(user: User): AbsenceData | null {
  if (user.demo) return demoData("absence") as AbsenceData;
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'absence'", user.id);
  return row ? (JSON.parse(row.json) as AbsenceData) : null;
}

/** Poslední stažené známky z paměti (bez sítě); pro ukázkový účet vygenerované. */
export function peekMarks(user: User): MarksData | null {
  if (user.demo) return demoData("marks") as MarksData;
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'marks'", user.id);
  return row ? (JSON.parse(row.json) as MarksData) : null;
}
