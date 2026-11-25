/** Jeden účet: heslo (scrypt) v nastavení, relace jako náhodný token v httpOnly cookie, v databázi jen jeho hash. */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { get, run, setting } from "./db";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "cml";
const DAYS = 60;

export const needsSetup = () => !setting("password_hash");

export function setupToken(): string {
  const env = process.env.SETUP_TOKEN?.trim();
  if (env) return env;
  const g = globalThis as unknown as { __liteSetup?: string };
  if (!g.__liteSetup) {
    g.__liteSetup = randomBytes(9).toString("base64url");
    console.log(`\n[classmate-lite] Instalační kód pro první spuštění: ${g.__liteSetup}\n`);
  }
  return g.__liteSetup;
}

export const tokenOk = (t: string) => {
  const a = Buffer.from(t.trim());
  const b = Buffer.from(setupToken());
  return a.length === b.length && timingSafeEqual(a, b);
};

const secure = () => process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";

/** Nová relace v databázi; vrací token pro cookie. */
export function newSession() {
  const t = randomToken(32);
  run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
  run("INSERT INTO sessions (id, expires_at) VALUES (?, ?)", sha256(t), Date.now() + DAYS * 86_400_000);
  return t;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_DAYS = DAYS;

export async function createSession() {
  (await cookies()).set(COOKIE, newSession(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: DAYS * 86_400, secure: secure() });
}

export async function loggedIn() {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return false;
  return !!get("SELECT 1 FROM sessions WHERE id = ? AND expires_at > ?", sha256(t), Date.now());
}

export async function requireLogin() {
  if (needsSetup()) redirect("/zprovozneni");
  if (!(await loggedIn())) redirect("/prihlaseni");
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) run("DELETE FROM sessions WHERE id = ?", sha256(t));
  jar.delete(COOKIE);
}

/** Jednoduchý limit pokusů v paměti procesu. */
const hits = new Map<string, number[]>();
export async function rateOk(scope: string, max: number, windowSec: number) {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const k = `${scope}:${ip}`;
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < windowSec * 1000);
  list.push(now);
  hits.set(k, list);
  return list.length <= max;
}
