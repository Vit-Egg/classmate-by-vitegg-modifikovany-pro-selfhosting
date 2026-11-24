import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "./paths";
import { pragueNow } from "./dates";
import { migrations } from "./migrations";
import { repairSchema } from "./schema-repair";

const g = globalThis as unknown as { __classmateDb?: Database.Database };

const FILE = "classmate.db";

/** Klíč pro české řazení podle abecedy (č za c, š za s, ř za r, ž za z, ch za h); SQLite samo české znaky řadí na konec. */
export const czKey = (s: string) =>
  s.toLowerCase().replace(/ch/g, "h~").replace(/[čšřž]/g, (c) => ({ č: "c", š: "s", ř: "r", ž: "z" })[c]! + "~").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function open() {
  const conn = new Database(path.join(dataDir(), FILE));
  conn.pragma("journal_mode = WAL");
  conn.pragma("synchronous = NORMAL"); // ve WAL režimu bezpečné a výrazně rychlejší zápisy (poslední transakce se může ztratit jen při pádu systému, ne aplikace)
  conn.function("cz", { deterministic: true }, (v) => (typeof v === "string" ? czKey(v) : v));
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  conn.pragma("cache_size = -32768"); // 32 MB cache stránek
  conn.pragma("temp_store = MEMORY");
  conn.pragma("mmap_size = 134217728"); // čtení přes mmap, bez kopírování do paměti
  conn.exec("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const done = new Set((conn.prepare("SELECT id FROM _migrations").all() as { id: number }[]).map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    if (m.rebuild) conn.pragma("foreign_keys = OFF");
    conn.transaction(() => {
      conn.exec(m.sql);
      if (m.rebuild && (conn.pragma("foreign_key_check") as unknown[]).length) throw new Error(`Migrace ${m.id} porušila cizí klíče`);
      conn.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
    })();
    if (m.rebuild) conn.pragma("foreign_keys = ON");
  }
  repairSchema(conn);
  conn.pragma("optimize"); // aktualizuje statistiky pro plánovač dotazů
  return conn;
}

export function db() {
  return (g.__classmateDb ??= open());
}

/** Připravené dotazy se drží v paměti, ať se stejné SQL nepřekládá při každém volání (stránka jich spouští desítky). */
const statements = new Map<string, Database.Statement>();
function stmt(sql: string) {
  let s = statements.get(sql);
  if (!s) {
    if (statements.size >= 500) statements.clear(); // pojistka proti nekonečnému růstu u dynamicky skládaných dotazů
    s = db().prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

export const all = <T>(sql: string, ...params: unknown[]) => stmt(sql).all(...(params as [])) as T[];
export const get = <T>(sql: string, ...params: unknown[]) => stmt(sql).get(...(params as [])) as T | undefined;
export const run = (sql: string, ...params: unknown[]) => stmt(sql).run(...(params as []));
export const tx = <T>(fn: () => T) => db().transaction(fn)();

/** Jednoduchý fixed-window limiter. Vrací false, když je limit překročen. */
export function rateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const row = get<{ count: number; reset_at: number }>("SELECT count, reset_at FROM rate_limits WHERE key = ?", key);
  if (!row || row.reset_at < now) {
    run("INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)", key, now + windowSec * 1000);
    return true;
  }
  if (row.count >= max) return false;
  run("UPDATE rate_limits SET count = count + 1 WHERE key = ?", key);
  return true;
}

/** Počítadlo událostí po dnech pro statistiky ve Správě (například generace AI). Chyba se nikdy nepropíše do aplikace. */
export function countUsage(kind: string, n = 1) {
  try {
    run("INSERT INTO usage_counts (day, kind, n) VALUES (?, ?, ?) ON CONFLICT(day, kind) DO UPDATE SET n = n + excluded.n", pragueNow().date, kind, n);
  } catch {}
}
