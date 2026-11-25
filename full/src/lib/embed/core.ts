/**
 * Plugin pro Classmate (formát `classmate-plugin/2`). Tento soubor je stejný v plné i odlehčené verzi (full/ a lite/).
 *
 * - Classmate najde plugin podle adresy webu na `/.well-known/classmate.json`. Manifest je veřejný a bez tajných klíčů:
 *   obsahuje jen strukturu (stránky do menu, widgety, rozvržení) s relativními cestami.
 * - Stránky a widgety se v Classmate načítají v rámu. Přihlášení: když v rámu chybí relace, ukáže se tlačítko, které otevře
 *   přihlášení v novém okně. Okno pak předá rámu jednorázový token a rám si vymění token za relaci v „dělené“ cookie
 *   (`Partitioned`, CHIPS), která platí jen pro vložení v Classmate.
 * - Vložit stránky smí jen tento server a domény z `EMBED_ORIGINS` (hlavička `frame-ancestors`).
 * - Záloha pro staré prohlížeče: tajný klíč v adrese (`?k=…`), jen pro widgety, viz stránka Widgety.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/* ---------- záložní klíč widgetů ---------- */

const keyFile = () => {
  const dir = path.resolve(process.env.DATA_DIR ?? "./data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, ".embed-key");
};

export function embedKey(): string {
  try {
    const k = fs.readFileSync(keyFile(), "utf8").trim();
    if (k.length >= 24) return k;
  } catch {}
  return rotateEmbedKey();
}

export function rotateEmbedKey(): string {
  const k = randomBytes(24).toString("base64url");
  fs.writeFileSync(keyFile(), k, { mode: 0o600 });
  return k;
}

export function keyOk(given: string | null | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(embedKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- kdo smí vkládat ---------- */

/** Domény, které smí stránky a widgety vložit, z `EMBED_ORIGINS` (čárkou oddělené, např. `https://classmate.cz`). */
export function embedOrigins(): string[] {
  return (process.env.EMBED_ORIGINS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

/** Hodnota `frame-ancestors` pro všechny stránky aplikace. */
export const frameAncestors = () => ["'self'", ...embedOrigins()].join(" ");

export function publicBase(): string {
  return (process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, "") || "http://localhost:3000";
}

/* ---------- jednorázové přihlašovací tokeny (okno s přihlášením → rám) ---------- */

type Pending = { userId: number; exp: number };
const g = globalThis as unknown as { __cmLoginTokens?: Map<string, Pending> };
const tokens = (g.__cmLoginTokens ??= new Map());
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Token platí 2 minuty a jen jednou. Drží se jen v paměti procesu. */
export function issueLoginToken(userId: number): string {
  const now = Date.now();
  for (const [k, v] of tokens) if (v.exp < now) tokens.delete(k);
  const t = randomBytes(24).toString("base64url");
  tokens.set(hash(t), { userId, exp: now + 120_000 });
  return t;
}

export function redeemLoginToken(t: string): number | null {
  const k = hash(String(t ?? ""));
  const p = tokens.get(k);
  tokens.delete(k);
  return p && p.exp > Date.now() ? p.userId : null;
}

/** Cookie relace pro rám v Classmate: dělená podle webu, kam je vložená (CHIPS). Vyžaduje Secure (na localhostu prohlížeče povolují i přes http). */
export function partitionedCookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

/* ---------- manifest ---------- */

export type WidgetDef = { id: string; title: string; height: number };

export const ALL_WIDGETS: WidgetDef[] = [
  { id: "rozvrh", title: "Rozvrh", height: 440 },
  { id: "suplovani", title: "Změny v rozvrhu", height: 220 },
  { id: "znamky", title: "Poslední známky", height: 300 },
  { id: "prumery", title: "Průměry", height: 420 },
  { id: "absence", title: "Absence", height: 260 },
  { id: "komens", title: "Komens", height: 280 },
  { id: "obedy", title: "Obědy", height: 280 },
  { id: "ukoly", title: "Úkoly", height: 260 },
  { id: "testy", title: "Testy a zkoušení", height: 260 },
];

export type ManifestPage = { id: string; title: string; path: string; icon: string };

export function manifest(opts: { name: string; description: string; icon: string; widgets: string[]; pages: ManifestPage[] }) {
  const widgets = ALL_WIDGETS.filter((w) => opts.widgets.includes(w.id)).map((w) => ({ id: w.id, title: w.title, path: `/embed/${w.id}`, height: w.height }));
  const has = (id: string) => widgets.some((w) => w.id === id);
  const pick = (list: [string, "l" | "r"][]) => list.filter(([id]) => has(id)).map(([widget, col]) => ({ widget, col }));
  return {
    format: "classmate-plugin/2",
    name: opts.name.slice(0, 60),
    description: opts.description.slice(0, 300),
    icon: opts.icon,
    pages: opts.pages,
    widgets,
    layouts: [
      // jako nástěnka původního Classmate: vlevo rozvrh, známky a absence, vpravo změny, úkoly, testy, Komens a obědy
      { id: "klasicky", title: "Klasický Classmate", widgets: pick([["rozvrh", "l"], ["suplovani", "r"], ["ukoly", "r"], ["testy", "r"], ["znamky", "l"], ["prumery", "r"], ["absence", "l"], ["komens", "r"], ["obedy", "l"]]) },
      { id: "den", title: "Jen dnešní den", widgets: pick([["rozvrh", "l"], ["suplovani", "r"], ["obedy", "r"]]) },
    ],
  };
}

/** Manifest je veřejný (nic tajného v něm není), takže ho smí číst kdokoli. */
export const MANIFEST_HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" };

export const forbidden = () => new Response("Neplatný nebo chybějící klíč.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/* ---------- vzhled uvnitř Classmate ---------- */

/**
 * Inline skript do <head>: v rámu přidá třídu `in-cm` (schová vlastní menu, průhledné pozadí) a převezme motiv a barvu z Classmate
 * (`?theme=light|dark&accent=…`, Classmate je přidává ke každé adrese). Zapamatuje si je pro další stránky v rámu.
 */
export const CM_FRAME_SCRIPT = `try{var d=document.documentElement;if(window.self!==window.top){d.classList.add("in-cm");var q=new URLSearchParams(location.search),s=sessionStorage,t=q.get("theme")||s.getItem("cm-theme"),a=q.get("accent")||s.getItem("cm-accent");if(t==="light"||t==="dark"){d.dataset.theme=t;s.setItem("cm-theme",t)}if(a&&/^[a-z]+$/.test(a)){if(a==="mint")delete d.dataset.accent;else d.dataset.accent=a;s.setItem("cm-accent",a)}}}catch(e){}`;
