/**
 * Tenký klient neoficiálního REST API Bakalářů (v3). Používáme jen čtení.
 * Heslo se nikdy neukládá – po ověření držíme jen šifrovaný refresh token.
 */
import { bkStat } from "./metrics";

export class BakalariError extends Error {
  constructor(
    message: string,
    public kind: "auth" | "network" | "config" | "api",
  ) {
    super(message);
  }
}

type Tokens = { access_token: string; refresh_token: string; expires_in: number };

/** Adresa, která míří dovnitř sítě serveru (localhost, privátní a linkové rozsahy, metadata cloudu): přes ni by šlo skenovat vnitřní služby (SSRF). */
export function internalHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".") && !h.includes(":")) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  if (h.includes(":")) return true; // IPv6 adresy se nepřijímají, školy mají doménová jména
  return /^\d+$/.test(h) || /^0x/i.test(h); // zkrácené zápisy IPv4 (2130706433, 0x7f000001)
}

export function normalizeBaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BakalariError("Neplatná adresa Bakalářů.", "config");
  }
  const devLocal = process.env.NODE_ENV !== "production" && url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !devLocal) throw new BakalariError("Adresa Bakalářů musí začínat https://.", "config");
  if (!devLocal && internalHost(url.hostname)) throw new BakalariError("Adresa Bakalářů musí být veřejná internetová adresa školy.", "config");
  if (url.username || url.password) throw new BakalariError("Adresa Bakalářů nesmí obsahovat jméno ani heslo.", "config");
  // některé školy mají Bakaláře v podsložce (např. https://bakalari.dubno.cz/bakaweb), ta se musí zachovat;
  // odkaz zkopírovaný z přihlašovací stránky (…/login, …/next/…, …/api/…) se oříznou na základ
  const path = url.pathname.replace(/\/+$/, "").replace(/\/(login|next|api|dashboard)(\/.*)?$/i, "");
  return url.origin + path;
}

/** Je na téhle adrese API Bakalářů? (`<základ>/api` vrací seznam s ApiVersion.) */
async function hasApi(base: string) {
  try {
    const r = await fetch(`${base}/api`, { headers: { Accept: "application/json", "Accept-Language": "cs-CZ,cs;q=0.9", "User-Agent": "Classmate/1.0" }, signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "follow" });
    if (!r.ok) return false;
    const j = (await r.json().catch(() => null)) as { ApiVersion?: string }[] | null;
    return Array.isArray(j) && !!j[0]?.ApiVersion;
  } catch {
    return false;
  }
}

const resolved = new Map<string, string>();

/**
 * Najde skutečný základ API. Většina škol má Bakaláře přímo na doméně (https://bakalari.ssps.cz), jiné v podsložce
 * (https://bakalari.dubno.cz/bakaweb). Zkouší zadanou adresu, doménu, /bakaweb a místo, kam doména přesměruje přihlášení.
 * Výsledek se pamatuje, takže funguje i škola uložená s neúplnou adresou.
 */
const resolving = new Map<string, Promise<string>>();
const unresolvedUntil = new Map<string, number>();
export function resolveBaseUrl(base: string): Promise<string> {
  const known = resolved.get(base);
  if (known) return Promise.resolve(known);
  // souběžné požadavky sdílejí jedno hledání a když se adresu nepodaří najít (škola neodpovídá), další minutu se nezkouší znovu (4 sondy po 8 s)
  if ((unresolvedUntil.get(base) ?? 0) > Date.now()) return Promise.resolve(base);
  let p = resolving.get(base);
  if (!p) {
    p = findBase(base).then((r) => {
      if (!resolved.has(base)) unresolvedUntil.set(base, Date.now() + 60_000);
      return r;
    }).finally(() => resolving.delete(base));
    resolving.set(base, p);
  }
  return p;
}

async function findBase(base: string): Promise<string> {
  const origin = new URL(base).origin;
  const cands = [base];
  try {
    const r = await fetch(`${origin}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "Classmate/1.0" }, cache: "no-store" });
    const loc = r.headers.get("location");
    if (loc) cands.push(normalizeBaseUrl(new URL(loc, origin).href));
  } catch {}
  cands.push(origin, `${origin}/bakaweb`);
  for (const c of [...new Set(cands)]) {
    if (await hasApi(c)) {
      resolved.set(base, c);
      return c;
    }
  }
  return base;
}

/* ---------- ochrana Bakalářů škol: omezení souběhu a jistič ---------- */

/** Kolik požadavků smí běžet na jednu školu naráz (BAKALARI_CONCURRENCY, výchozí 6). Školní servery bývají malé a při náporu by padly. */
const maxConcurrent = () => {
  const n = Number(process.env.BAKALARI_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 6;
};
const waiters = new Map<string, (() => void)[]>();
const QUEUE_MAX_WAIT = 20_000;
const BREAKER_FAILS = 5;
const BREAKER_OPEN_MS = 45_000;

/** Počká na volné místo u dané školy; když se fronta nehýbe 20 s, vzdá to (stránka ukáže starou kopii). */
async function acquire(origin: string) {
  const st = bkStat(origin);
  if (st.openUntil > Date.now()) throw new BakalariError("Bakaláři školy teď neodpovídají, zkusím to za chvíli.", "network");
  if (st.active < maxConcurrent()) {
    st.active++;
    return;
  }
  st.waiting++;
  try {
    await new Promise<void>((resolve, reject) => {
      const q = waiters.get(origin) ?? [];
      waiters.set(origin, q);
      const turn = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = q.indexOf(turn);
        if (i >= 0) q.splice(i, 1);
        reject(new BakalariError("Bakaláři jsou přetížení, zkus to za chvíli.", "network"));
      }, QUEUE_MAX_WAIT);
      q.push(turn);
    });
  } finally {
    st.waiting--;
  }
  // místo předal ten, kdo skončil (active se nezměnilo)
}

function release(origin: string) {
  const q = waiters.get(origin);
  const next = q?.shift();
  if (next) next();
  else bkStat(origin).active = Math.max(0, bkStat(origin).active - 1);
}

/** Jistič: po několika selháních v řadě se škola na 45 s přestane zkoušet (nikdo nečeká 15 s na vypršení), pak se zkusí jeden požadavek. */
function record(origin: string, ok: boolean, ms: number) {
  const st = bkStat(origin);
  if (ok) {
    st.ok++;
    st.consecutive = 0;
    st.openUntil = 0;
    st.avgMs = st.avgMs ? Math.round(st.avgMs * 0.9 + ms * 0.1) : ms;
    return;
  }
  st.fail++;
  st.lastFailAt = Date.now();
  if (++st.consecutive >= BREAKER_FAILS) {
    if (st.openUntil <= Date.now()) st.open++;
    st.openUntil = Date.now() + BREAKER_OPEN_MS;
    st.consecutive = BREAKER_FAILS - 1; // po otevření stačí jedno další selhání a zase se zavře na dalších 45 s
  }
}

async function request(base: string, path: string, init: RequestInit) {
  const root = await resolveBaseUrl(base).catch(() => base);
  let origin = root;
  try {
    origin = new URL(root).origin;
  } catch {}
  await acquire(origin);
  const t0 = Date.now();
  try {
    // Node (undici) posílá výchozí "Accept-Language: *", na které Bakaláři padají s chybou 500.
    const headers = { "Accept-Language": "cs-CZ,cs;q=0.9", Accept: "application/json", "User-Agent": "Classmate/1.0", ...(init.headers as Record<string, string>) };
    const res = await fetch(root + path, { ...init, headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    record(origin, res.status < 500, Date.now() - t0);
    return res;
  } catch {
    record(origin, false, Date.now() - t0);
    throw new BakalariError("Bakaláři teď nejsou dostupné.", "network");
  } finally {
    release(origin);
  }
}

async function tokenRequest(base: string, params: Record<string, string>): Promise<Tokens> {
  const res = await request(normalizeBaseUrl(base), "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "ANDR", ...params }),
  });
  if (res.status === 400 || res.status === 401) throw new BakalariError("Přihlášení do Bakalářů se nezdařilo.", "auth");
  if (res.status === 404) throw new BakalariError("Na téhle adrese jsem API Bakalářů nenašel. Zkontroluj adresu (někdy je v podsložce, např. https://bakalari.skola.cz/bakaweb).", "config");
  if (!res.ok) throw new BakalariError(`Bakaláři vrátili chybu ${res.status}.`, "api");
  const json = (await res.json().catch(() => null)) as Tokens | null;
  if (!json?.access_token || !json.refresh_token) throw new BakalariError("Neočekávaná odpověď Bakalářů.", "api");
  return json;
}

export const bkLogin = (base: string, username: string, password: string) =>
  tokenRequest(base, { grant_type: "password", username, password });

export const bkRefresh = (base: string, refreshToken: string) =>
  tokenRequest(base, { grant_type: "refresh_token", refresh_token: refreshToken });

export async function bkGet<T = any>(base: string, accessToken: string, path: string): Promise<T> {
  const res = await request(normalizeBaseUrl(base), path, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new BakalariError("Platnost přihlášení do Bakalářů vypršela.", "auth");
  if (!res.ok) throw new BakalariError(`Bakaláři vrátili chybu ${res.status}.`, "api");
  return (await res.json()) as T;
}

/** Obecné volání (POST / PUT) pro Komens. Seznamy zpráv se načítají přes POST s prázdným formulářem. */
export async function bkCall<T = any>(base: string, accessToken: string, path: string, method: "POST" | "PUT", form = ""): Promise<T | null> {
  const res = await request(normalizeBaseUrl(base), path, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  if (res.status === 401) throw new BakalariError("Platnost přihlášení do Bakalářů vypršela.", "auth");
  if (!res.ok) throw new BakalariError(`Bakaláři vrátili chybu ${res.status}.`, "api");
  if (res.status === 204) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** POST s JSON tělem (odeslání zprávy v Komens). Při chybě 400 se vrátí text od Bakalářů, ať je vidět důvod. */
export async function bkJson<T = any>(base: string, accessToken: string, path: string, body: unknown): Promise<T | null> {
  const res = await request(normalizeBaseUrl(base), path, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  if (res.status === 401) throw new BakalariError("Platnost přihlášení do Bakalářů vypršela.", "auth");
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { Message?: string; message?: string } | null;
    const why = j?.Message ?? j?.message;
    throw new BakalariError(why ? `Bakaláři zprávu nepřijali: ${why}` : `Bakaláři vrátili chybu ${res.status}.`, "api");
  }
  return (await res.json().catch(() => null)) as T | null;
}

/** Stažení souboru (příloha zprávy). */
export async function bkBytes(base: string, accessToken: string, path: string) {
  const res = await request(normalizeBaseUrl(base), path, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "*/*" } });
  if (res.status === 401) throw new BakalariError("Platnost přihlášení do Bakalářů vypršela.", "auth");
  if (!res.ok) throw new BakalariError(`Bakaláři vrátili chybu ${res.status}.`, "api");
  return { data: Buffer.from(await res.arrayBuffer()), disposition: res.headers.get("content-disposition") ?? "", type: res.headers.get("content-type") ?? "application/octet-stream" };
}
