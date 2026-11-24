/**
 * Bakaláři pro jednoho člověka: jen čtení (rozvrh, známky, absence, Komens). Heslo se neukládá, drží se jen šifrovaný refresh token.
 * Data jdou do cache; stránky i widgety čtou z ní a Bakaláře se volají šetrně (obnova nejdřív po TTL, na pozadí každých SYNC_MINUTES).
 */
import { BakalariError, bkCall, bkGet, bkLogin, bkRefresh, normalizeBaseUrl } from "./bakalari";
import { decrypt, encrypt } from "./crypto";
import { get, ME, run, setting, setSetting } from "./db";
import { addDays, mondayOf, pragueNow } from "./dates";
import { normalizeAbsence, normalizeMarks, normalizeTimetable } from "./normalize";
import { onAbsence, onKomens, onMarks, onTimetable } from "./notify";
import type { AbsenceData, MarksData, Timetable } from "./types";

export type KomensMessage = { id: string; title: string; text: string; sentAt: string; sender: string; read: boolean };

export const bkConfigured = () => !!setting("bakalari_refresh_enc") && !!setting("bakalari_url");
export const bkInfo = () => ({ url: setting("bakalari_url"), user: setting("bakalari_user"), name: setting("bakalari_name"), cls: setting("bakalari_class") });

let access: { token: string; exp: number } | null = null;
let lock: Promise<unknown> = Promise.resolve();

export async function connect(rawUrl: string, username: string, password: string) {
  const url = normalizeBaseUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  const t = await bkLogin(url, username, password);
  const me = await bkGet<{ FullName?: string; Class?: { Abbrev?: string } }>(url, t.access_token, "/api/3/user");
  setSetting("bakalari_url", url);
  setSetting("bakalari_user", username);
  setSetting("bakalari_refresh_enc", encrypt(t.refresh_token));
  setSetting("bakalari_name", (me.FullName ?? "").trim());
  setSetting("bakalari_class", me.Class?.Abbrev ?? "");
  run("DELETE FROM cache WHERE user_id = ? AND key NOT LIKE 'strava%'", ME);
  access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
}

export function disconnect() {
  for (const k of ["bakalari_refresh_enc", "bakalari_user", "bakalari_name", "bakalari_class"]) setSetting(k, null);
  run("DELETE FROM cache WHERE user_id = ? AND key NOT LIKE 'strava%'", ME);
  access = null;
}

/** Refresh token se po každém použití mění, proto obnova běží v jednom proudu. */
function token(): Promise<string> {
  const next = lock.catch(() => {}).then(async () => {
    if (access && access.exp > Date.now()) return access.token;
    const enc = setting("bakalari_refresh_enc");
    const url = setting("bakalari_url");
    if (!enc || !url) throw new BakalariError("Bakaláři nejsou propojení.", "config");
    const t = await bkRefresh(url, decrypt(enc));
    setSetting("bakalari_refresh_enc", encrypt(t.refresh_token));
    access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
    return t.access_token;
  });
  lock = next;
  return next;
}

const bk = async <T = any,>(path: string) => bkGet<T>(setting("bakalari_url")!, await token(), path);

/* ---------- cache ---------- */

export const peek = <T,>(key: string): { data: T; at: number } | null => {
  const r = get<{ json: string; fetched_at: number }>("SELECT json, fetched_at FROM cache WHERE user_id = ? AND key = ?", ME, key);
  return r ? { data: JSON.parse(r.json) as T, at: r.fetched_at } : null;
};

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, force: boolean, after?: (data: T, prev: T | null) => void): Promise<T | null> {
  const old = peek<T>(key);
  if (old && !force && Date.now() - old.at < ttlMs) return old.data;
  if (!bkConfigured()) return old?.data ?? null;
  try {
    const data = await fetcher();
    run("INSERT OR REPLACE INTO cache (user_id, key, json, fetched_at) VALUES (?, ?, ?, ?)", ME, key, JSON.stringify(data), Date.now());
    try {
      after?.(data, old?.data ?? null);
    } catch (e) {
      console.error("notify failed", e);
    }
    setSetting("last_sync", String(Date.now()));
    setSetting("last_error", null);
    return data;
  } catch (e) {
    setSetting("last_error", e instanceof Error ? e.message : "Chyba spojení s Bakaláři.");
    return old?.data ?? null;
  }
}

const TTL = 10 * 60_000;
export const ttKey = (monday: string) => `tt:${monday}`;
export const weekStart = (which: "this" | "next") => {
  const now = pragueNow();
  // o víkendu je „tento týden“ už ten příští
  const base = now.dow > 5 ? addDays(mondayOf(now.date), 7) : mondayOf(now.date);
  return which === "this" ? base : addDays(base, 7);
};

export const timetable = (monday: string, force = false) => cached<Timetable>(ttKey(monday), TTL, async () => normalizeTimetable(await bk(`/api/3/timetable/actual?date=${monday}`)), force, (d, p) => onTimetable(monday, d, p));
export const permanent = (force = false) => cached<Timetable>("tt:permanent", 12 * 3600_000, async () => normalizeTimetable(await bk("/api/3/timetable/permanent")), force);
export const marks = (force = false) => cached<MarksData>("marks", TTL, async () => normalizeMarks(await bk("/api/3/marks")), force, onMarks);
export const absence = (force = false) => cached<AbsenceData>("absence", TTL, async () => normalizeAbsence(await bk("/api/3/absence/student")), force, onAbsence);

const plain = (s: string) =>
  s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

export const komens = (box: "received" | "noticeboard" = "received", force = false) =>
  cached<KomensMessage[]>(
    `komens:${box}`,
    TTL,
    async () => {
      const j = await bkCall<{ Messages?: any[] }>(setting("bakalari_url")!, await token(), `/api/3/komens/messages/${box}`, "POST");
      return (j?.Messages ?? [])
        .map((m) => ({ id: String(m.Id ?? ""), title: String(m.Title ?? "").trim() || "(bez předmětu)", text: plain(String(m.Text ?? "")), sentAt: String(m.SentDate ?? ""), sender: String(m.Sender?.Name ?? ""), read: m.Read !== false }))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    },
    force,
    box === "received" ? onKomens : undefined,
  );

/** Všechno najednou (tlačítko Načíst znovu a synchronizace na pozadí). Mezi dotazy krátká pauza, ať se server školy nezahltí. */
export async function syncAll(force = true) {
  if (!bkConfigured()) return;
  const pause = () => new Promise((r) => setTimeout(r, 400));
  await timetable(weekStart("this"), force);
  await pause();
  await timetable(weekStart("next"), force);
  await pause();
  await marks(force);
  await pause();
  await absence(force);
  await pause();
  await komens("received", force);
  await pause();
  await komens("noticeboard", force);
}
