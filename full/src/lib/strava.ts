/**
 * Strava.cz (školní obědy) přes interní JSON API webové aplikace app.strava.cz. API není oficiální a může se změnit.
 * Strava.cz nemá obnovovací token, proto je heslo uživatele v databázi šifrované a před načtením se uživatel přihlásí znovu.
 * Jídelníček jde načíst i bez přihlášení, stačí číslo jídelny (účet bez jména a hesla je „anonymní“, jen čte).
 * Důležité: server odmítá požadavky s hlavičkou application/json (odpoví chybou 555), web posílá JSON jako text/plain.
 */
import { decrypt } from "./crypto";
import { get, run } from "./db";
import { addDays, pragueNow } from "./dates";

const BASE = process.env.STRAVA_BASE || "https://app.strava.cz";

export class StravaError extends Error {
  constructor(message: string, public kind: "auth" | "network" | "api" = "api") {
    super(message);
  }
}

/** Je to polévka nebo oběd (ne snídaně, svačina ani večeře)? Slouží pro stručný přehled na Dnes. */
export const isLunch = (m: Pick<Meal, "soup" | "label">) => m.soup || /ob[eě]d/i.test(m.label);

export type Meal = { id: number; date: string; soup: boolean; label: string; name: string; price: number; ordered: boolean; canOrder: boolean; canCancel: boolean; allergens: string[]; deadline: string };
export type Day = { date: string; closed: boolean; meals: Meal[] };
export type Session = { sid: string; s5url: string; credit: number; name: string; canteenName: string };

/** Účet Strava.cz uživatele (zapíná si ho každý sám, včetně čísla jídelny). anon = jen jídelníček bez přihlášení. */
export const stravaAccount = (userId: number) => {
  const r = get<{ username: string; canteen: string }>("SELECT username, canteen FROM strava_accounts WHERE user_id = ?", userId);
  return r && { ...r, anon: !r.username };
};

async function call<T = any>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8", Accept: "application/json", "User-Agent": "Classmate/1.0" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new StravaError("Strava.cz teď není dostupná.", "network");
  }
  const body = (await res.json().catch(() => null)) as any;
  if (res.status === 555 || body?.state === "error") {
    const msg = String(body?.message ?? "");
    throw new StravaError(res.status === 555 && /heslo|jmen|přihl|login|password|user/i.test(msg) ? "Strava.cz odmítla přihlášení, zkontroluj jméno a heslo." : msg || "Strava.cz vrátila chybu.", /heslo|jmen|přihl|login|password|user/i.test(msg) ? "auth" : "api");
  }
  if (!res.ok) throw new StravaError(`Strava.cz vrátila chybu ${res.status}.`);
  return body as T;
}

export async function stravaLogin(canteen: string, username: string, password: string): Promise<Session> {
  const j = await call<{ sid?: string; s5url?: string; uzivatel?: { jmeno?: string; konto?: unknown; nazevJidelny?: string } }>("login", { cislo: canteen, jmeno: username, heslo: password, zustatPrihlasen: true, environment: "W", lang: "CZ" });
  if (!j?.sid) throw new StravaError("Strava.cz odmítla přihlášení, zkontroluj jméno a heslo.", "auth");
  return { sid: j.sid, s5url: j.s5url ?? "", credit: Number(String(j.uzivatel?.konto ?? 0).replace(",", ".")) || 0, name: j.uzivatel?.jmeno ?? "", canteenName: j.uzivatel?.nazevJidelny ?? "" };
}

const sessions = new Map<number, { s: Session; exp: number }>();
export const forgetStravaSession = (userId: number) => {
  sessions.delete(userId);
  memo.delete(userId);
};

async function session(userId: number, canteen: string, fresh = false): Promise<Session> {
  const c = sessions.get(userId);
  if (c && c.exp > Date.now() && !fresh) return c.s;
  const acc = get<{ username: string; password_enc: string }>("SELECT username, password_enc FROM strava_accounts WHERE user_id = ?", userId);
  if (!acc) throw new StravaError("Strava.cz není propojená.", "auth");
  const s = await stravaLogin(canteen, acc.username, decrypt(acc.password_enc));
  sessions.set(userId, { s, exp: Date.now() + 10 * 60_000 });
  return s;
}

/** Datum z API (2026-10-26 nebo 26.10.2026) → YYYY-MM-DD. */
function isoDate(v: unknown): string {
  const s = String(v ?? "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const cz = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s);
  return cz ? `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}` : "";
}

type Row = { datum?: unknown; polevka?: string; veta?: unknown; druh?: string; druh_popis?: string; nazev?: string; cena?: unknown; pocet?: unknown; omezeniObj?: { obj?: string; zm?: string; den?: string }; alergeny?: unknown; casKonec?: string };
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;

export function parseMenu(raw: unknown): Day[] {
  const days = new Map<string, Day>();
  if (!raw || typeof raw !== "object") return [];
  for (const [k, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.startsWith("table") || !Array.isArray(rows)) continue;
    for (const r of rows as Row[]) {
      if (!r || typeof r !== "object") continue;
      const date = isoDate(r.datum);
      if (!date) continue;
      const day = days.get(date) ?? { date, closed: false, meals: [] };
      days.set(date, day);
      if (String(r.omezeniObj?.den ?? "").trim().toUpperCase() === "VP") {
        day.closed = true; // jídelna ten den nevaří
        continue;
      }
      const name = String(r.nazev ?? "").trim();
      const label = String(r.druh_popis ?? "").trim();
      if (!name || name.toLowerCase() === label.toLowerCase() || /^oběd\s*\d*$/i.test(name)) continue; // prázdné místo v jídelníčku
      const allergens = Array.isArray(r.alergeny) ? (r.alergeny as unknown[]).map((a) => (Array.isArray(a) ? String(a[1] ?? a[0]) : String(a))).filter(Boolean) : [];
      day.meals.push({
        id: Number(r.veta) || 0, date, soup: /^PO/i.test(String(r.druh ?? "")) || String(r.druh ?? "").toUpperCase() === "P" || r.polevka === "A", label: label || "Oběd", name, price: num(r.cena), ordered: num(r.pocet) >= 1,
        canOrder: !String(r.omezeniObj?.obj ?? "").trim(), canCancel: !String(r.omezeniObj?.zm ?? "").trim(), allergens, deadline: String(r.casKonec ?? ""),
      });
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Veřejný jídelníček bez přihlášení: stačí číslo jídelny. Bez cen, kreditu a objednávek. */
export async function stravaPublicMenu(canteen: string): Promise<{ days: Day[]; name: string }> {
  let raw: { canteen?: { v_nazev?: string[] }; meals?: unknown };
  try {
    raw = await call("jidelnickyPage", { cislo: canteen, lang: "CZ" });
  } catch (e) {
    if (e instanceof StravaError && e.kind === "api") throw new StravaError("Jídelnu s tímhle číslem se nepodařilo najít. Zkontroluj číslo jídelny.", "api");
    throw e;
  }
  if (!raw?.meals || typeof raw.meals !== "object") throw new StravaError("Jídelnu s tímhle číslem se nepodařilo najít. Zkontroluj číslo jídelny.");
  const days = parseMenu(raw.meals).map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, ordered: false, canOrder: false, canCancel: false })) }));
  return { days, name: String(raw.canteen?.v_nazev?.[0] ?? "").trim() };
}

/* ---------- ukázkový jídelníček (demo): vymyšlená jídla, objednávky se drží jen u ukázkového účtu ---------- */

export const DEMO_CANTEEN = "demo";
const DEMO_DISHES: [string, string, string][] = [
  ["Zeleninová polévka s kroupami", "Svíčková na smetaně, houskový knedlík", "Kuřecí řízek, bramborová kaše, okurkový salát"],
  ["Hovězí vývar s nudlemi", "Špagety po boloňsku se sýrem", "Čočka na kyselo, vejce, okurka"],
  ["Bramboračka", "Smažený sýr, vařené brambory, tatarská omáčka", "Rizoto se zeleninou a sýrem"],
  ["Gulášová polévka", "Kuře na paprice, těstoviny", "Zapečené těstoviny se šunkou"],
  ["Dršťková polévka", "Rybí filé, bramborový salát", "Vepřová pečeně, zelí, knedlík"],
];
const demoOrders = (userId: number): number[] => {
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'demo-lunch'", userId);
  try {
    return row ? (JSON.parse(row.json) as number[]) : [];
  } catch {
    return [];
  }
};
function demoMenu(userId: number): Day[] {
  const ordered = new Set(demoOrders(userId));
  const today = pragueNow().date;
  const days: Day[] = [];
  for (let i = 0, made = 0; made < 10 && i < 21; i++) {
    const date = addDays(today, i);
    const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (dow > 4) continue;
    const [soup, a, b] = DEMO_DISHES[made % DEMO_DISHES.length];
    const deadline = `${addDays(date, -1)}T23:59:00+01:00`; // objednat jde do půlnoci předchozího dne
    const open = Date.parse(deadline) > Date.now();
    const base = (made + 1) * 10 + 1000;
    const meal = (k: number, soupFlag: boolean, label: string, name: string, price: number): Meal => ({ id: base + k, date, soup: soupFlag, label, name, price, ordered: ordered.has(base + k), canOrder: open, canCancel: open, allergens: soupFlag ? [] : ["1", "3", "7"], deadline });
    days.push({ date, closed: false, meals: [meal(0, true, "Polévka", soup, 0), meal(1, false, "Oběd 1", a, 82), meal(2, false, "Oběd 2", b, 79)] });
    made++;
  }
  return days;
}

async function fetchMenu(userId: number, canteen: string, fresh = false): Promise<{ days: Day[]; credit: number; session: Session; anon: boolean }> {
  if (canteen === DEMO_CANTEEN) return { days: demoMenu(userId), credit: 350, session: { sid: "", s5url: "", credit: 350, name: "", canteenName: "Demo jídelna" }, anon: false };
  if (stravaAccount(userId)?.anon) {
    const p = await stravaPublicMenu(canteen);
    return { days: p.days, credit: 0, session: { sid: "", s5url: "", credit: 0, name: "", canteenName: p.name }, anon: true };
  }
  const s = await session(userId, canteen, fresh);
  try {
    const raw = await call("objednavky", { cislo: canteen, sid: s.sid, s5url: s.s5url, lang: "CZ", konto: s.credit, podminka: "", ignoreCert: false });
    return { days: parseMenu(raw), credit: s.credit, session: s, anon: false };
  } catch (e) {
    if (!fresh && e instanceof StravaError && e.kind !== "network") return fetchMenu(userId, canteen, true); // vypršelo přihlášení: jednou znovu
    throw e;
  }
}

const memo = new Map<number, { at: number; v: Awaited<ReturnType<typeof fetchMenu>> }>();
/** Jídelníček a kredit; na 2 minuty se drží v paměti, ať se Strava.cz neotravuje při každém otevření stránky. */
export async function stravaMenu(userId: number, force = false) {
  const canteen = stravaAccount(userId)?.canteen;
  if (!canteen) throw new StravaError("Strava.cz není propojená.", "auth");
  const hit = memo.get(userId);
  if (hit && !force && Date.now() - hit.at < 2 * 60_000) return hit.v;
  const v = await fetchMenu(userId, canteen);
  memo.set(userId, { at: Date.now(), v });
  return v;
}

/** Objedná nebo zruší jedno jídlo a ověří výsledek podle čerstvě načteného jídelníčku. */
export async function stravaOrder(userId: number, mealId: number, want: boolean, expectName: string) {
  const acc = stravaAccount(userId);
  const canteen = acc?.canteen;
  if (!canteen) throw new StravaError("Strava.cz není propojená.", "auth");
  if (acc.anon) throw new StravaError("Objednávat jde po přihlášení ke Strava.cz (v Nastavení).", "auth");
  if (canteen === DEMO_CANTEEN) {
    // ukázková jídelna: objednávka se jen zapíše k účtu, žádná skutečná jídelna se nevolá
    const target = demoMenu(userId).flatMap((d) => d.meals).find((m) => m.id === mealId);
    if (!target || target.name !== expectName) throw new StravaError("Jídelníček se mezitím změnil, obnov stránku a zkus to znovu.");
    if (want ? !target.canOrder : !target.canCancel) throw new StravaError("Tohle jídlo už jde objednat jen v jídelně (termín uplynul).");
    const set = new Set(demoOrders(userId));
    // ve dni je vždy nejvýš jeden oběd: objednání druhého zruší první
    if (want) for (const m of demoMenu(userId).find((d) => d.date === target.date)!.meals) set.delete(m.id);
    if (want) set.add(mealId);
    else set.delete(mealId);
    run("INSERT OR REPLACE INTO cache (user_id, key, json, fetched_at) VALUES (?, 'demo-lunch', ?, ?)", userId, JSON.stringify([...set]), Date.now());
    memo.delete(userId);
    return;
  }
  // ID jídla se při změně jídelníčku mění, proto se před zápisem znovu načte menu a zkontroluje, že jde o totéž jídlo
  // (využije se už přihlášená relace; když vypršela, fetchMenu se přihlásí znovu samo. Dřív se přihlašovalo dvakrát navíc a objednávka trvala přes 10 s)
  const before = await fetchMenu(userId, canteen);
  const target = before.days.flatMap((d) => d.meals).find((m) => m.id === mealId);
  if (!target || target.name !== expectName) throw new StravaError("Jídelníček se mezitím změnil, obnov stránku a zkus to znovu.");
  if (want ? !target.canOrder : !target.canCancel) throw new StravaError(want ? "Tohle jídlo už jde objednat jen v jídelně (termín uplynul)." : "Tuhle objednávku už jde zrušit jen v jídelně (termín uplynul).");
  if (want === target.ordered) return;
  const s = before.session;
  const base = { cislo: canteen, sid: s.sid, lang: "CZ", ignoreCert: "false" };
  await call("pridejJidloS5", { ...base, url: s.s5url, veta: String(mealId), pocet: want ? "1" : "0" });
  await call("saveOrders", { ...base, url: s.s5url, xml: null });
  const v = await fetchMenu(userId, canteen);
  memo.set(userId, { at: Date.now(), v });
  const meal = v.days.flatMap((d) => d.meals).find((m) => m.id === mealId);
  if (!meal || meal.ordered !== want) throw new StravaError(want ? "Objednávka se neuložila (jídelna ji možná už nepřijímá)." : "Zrušení se neuložilo (jídelna ho možná už nepřijímá).");
}

