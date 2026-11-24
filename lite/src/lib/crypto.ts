import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

let masterKey: Buffer | null = null;

function key() {
  if (masterKey) return masterKey;
  let secret = process.env.APP_SECRET;
  if (!secret) {
    const file = path.join(dataDir(), ".secret");
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
    secret = fs.readFileSync(file, "utf8").trim();
  }
  if (secret.length < 32) console.warn("[bezpečnost] APP_SECRET je krátký (méně než 32 znaků). Vygeneruj nový: openssl rand -base64 48 (po změně se ale nedají přečíst uložená hesla a klíče, uživatelé je zadají znovu).");
  masterKey = crypto.createHash("sha256").update(secret).digest();
  return masterKey;
}

/** HMAC s tajným klíčem aplikace – pseudonym, který nejde bez klíče převést zpět na uživatele. */
export const hmac = (data: string) => crypto.createHmac("sha256", key()).update(data).digest("hex");

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

const scryptAsync = (password: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, len, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));

/**
 * Asynchronní varianty: scrypt běží ve vláknech libuv, ne v hlavním vlákně. Synchronní verze při dávce přihlášení
 * (třída, která se hromadně registruje) zablokuje celý server na desítky milisekund u každého hesla.
 */
export async function hashPasswordAsync(password: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${(await scryptAsync(password, salt, 64)).toString("base64url")}`;
}

export async function verifyPasswordAsync(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

/** AES-256-GCM, formát v1.iv.tag.ciphertext (base64url). */
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string) {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Bad ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
