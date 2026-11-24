/** SQLite pro jednoho člověka: nastavení, cache dat z Bakalářů, účet Strava.cz a relace. `user_id` je vždy 1 (rozhraní zůstává stejné jako v plném Classmate). */
import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "./paths";

const g = globalThis as unknown as { __liteDb?: Database.Database };

function open() {
  const c = new Database(path.join(dataDir(), "classmate-lite.db"));
  c.pragma("journal_mode = WAL");
  c.pragma("busy_timeout = 5000");
  c.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache (user_id INTEGER NOT NULL, key TEXT NOT NULL, json TEXT NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (user_id, key));
    CREATE TABLE IF NOT EXISTS strava_accounts (user_id INTEGER PRIMARY KEY, username TEXT NOT NULL DEFAULT '', canteen TEXT NOT NULL, password_enc TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  return c;
}

export const db = () => (g.__liteDb ??= open());
export const get = <T = any>(sql: string, ...p: unknown[]) => db().prepare(sql).get(...p) as T | undefined;
export const all = <T = any>(sql: string, ...p: unknown[]) => db().prepare(sql).all(...p) as T[];
export const run = (sql: string, ...p: unknown[]) => db().prepare(sql).run(...p);

export const ME = 1;
export const setting = (k: string) => get<{ value: string }>("SELECT value FROM settings WHERE key = ?", k)?.value ?? null;
export const setSetting = (k: string, v: string | null) => (v == null ? run("DELETE FROM settings WHERE key = ?", k) : run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", k, v));
