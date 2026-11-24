/** První spuštění serveru: dokud v databázi není žádný uživatel, běží průvodce (/zprovozneni), který vytvoří školu, třídu a správce. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { get, run, tx } from "./db";
import { hashPassword } from "./crypto";
import { passwordProblem } from "./password-policy";
import { normalizeBaseUrl, BakalariError } from "./bakalari";

export const needsSetup = () => !get("SELECT 1 FROM users LIMIT 1");

/**
 * Instalační kód (SETUP_TOKEN v .env). Když není nastavený, vygeneruje se při startu náhodný a vypíše se do logu serveru:
 * čerstvý server tak nikdy nezůstane otevřený komukoli, kdo na něj narazí dřív než správce.
 */
export function setupToken(): string {
  const env = process.env.SETUP_TOKEN?.trim();
  if (env) return env;
  const g = globalThis as unknown as { __classmateSetupToken?: string };
  return (g.__classmateSetupToken ??= randomBytes(9).toString("base64url"));
}

export const setupTokenRequired = () => true;
export const setupTokenFromEnv = () => !!process.env.SETUP_TOKEN?.trim();

export class SetupError extends Error {}

const Input = z.object({
  name: z.string().trim().min(2, "Napiš své jméno.").max(100, "Jméno je moc dlouhé."),
  email: z.string().trim().toLowerCase().email("Napiš platný e-mail.").max(200),
  password: z.string().max(200, "Heslo je moc dlouhé."),
  school: z.string().trim().min(2, "Název školy musí mít aspoň 2 znaky.").max(100, "Název školy je moc dlouhý."),
  bakalari: z.string().trim().max(300).default(""),
  class: z.string().trim().min(1, "Napiš název své třídy.").max(40, "Název třídy je moc dlouhý."),
});

/** Vytvoří školu, třídu a správce a vrátí id správce. Smí proběhnout jen jednou, na serveru bez uživatelů. */
export function createServer(input: unknown, token: string): number {
  if (!needsSetup()) throw new SetupError("Server už je nastavený.");
  const a = Buffer.from(token.trim());
  const b = Buffer.from(setupToken());
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new SetupError("Instalační kód nesedí.");
  const r = Input.safeParse(input);
  if (!r.success) throw new SetupError(r.error.issues[0].message);
  const v = r.data;
  const weak = passwordProblem(v.password, v.email, v.name);
  if (weak) throw new SetupError(weak);
  let url: string | null = null;
  if (v.bakalari) {
    try {
      url = normalizeBaseUrl(/^https?:\/\//i.test(v.bakalari) ? v.bakalari : `https://${v.bakalari}`);
    } catch (e) {
      throw new SetupError(e instanceof BakalariError ? e.message : "Neplatná adresa Bakalářů.");
    }
  }
  return tx(() => {
    if (!needsSetup()) throw new SetupError("Server už je nastavený.");
    const now = Date.now();
    const school = Number(run("INSERT INTO schools (name, bakalari_url, created_at) VALUES (?, ?, ?)", v.school, url, now).lastInsertRowid);
    const cls = Number(run("INSERT INTO classes (school_id, name, roster) VALUES (?, ?, ?)", school, v.class, v.name).lastInsertRowid); // správce je prvním jménem v seznamu třídy
    return Number(
      run("INSERT INTO users (email, name, password_hash, role, school_id, class_id, created_at) VALUES (?, ?, ?, 'admin', ?, ?, ?)", v.email, v.name, hashPassword(v.password), school, cls, now).lastInsertRowid,
    );
  });
}
