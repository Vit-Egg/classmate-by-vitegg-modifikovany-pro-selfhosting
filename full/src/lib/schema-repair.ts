/**
 * Pojistka proti rozjetému schématu: po migracích ověří, že existují tabulky a sloupce, které aplikace od migrace 8 dál potřebuje,
 * a chybějící doplní. Normálně nedělá nic. Zavedeno poté, co na jednom serveru zůstala migrace zapsaná, ale tabulka chyběla.
 * Při přidání nové tabulky nebo sloupce v migraci je sem připiš také (stačí idempotentní zápis).
 */
import type Database from "better-sqlite3";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS test_attend (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
     writes INTEGER NOT NULL,
     PRIMARY KEY (user_id, test_id)
   )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id INTEGER PRIMARY KEY,
     at INTEGER NOT NULL,
     actor_id INTEGER,
     actor_name TEXT,
     action TEXT NOT NULL,
     target_user_id INTEGER,
     target TEXT,
     detail TEXT,
     ip TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC)`,
  `CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log (actor_id)`,
  `CREATE INDEX IF NOT EXISTS audit_log_target_user ON audit_log (target_user_id)`,
  `CREATE TABLE IF NOT EXISTS note_reflections (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     understanding INTEGER,
     understanding_note TEXT NOT NULL DEFAULT '',
     focus INTEGER,
     focus_note TEXT NOT NULL DEFAULT '',
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, note_id)
   )`,
  `CREATE TABLE IF NOT EXISTS note_votes (
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     stars INTEGER NOT NULL,
     comment TEXT NOT NULL DEFAULT '',
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (note_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS note_votes_user ON note_votes (user_id)`,
  `CREATE TABLE IF NOT EXISTS duty_weeks (
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     week_start TEXT NOT NULL,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     round INTEGER NOT NULL,
     PRIMARY KEY (class_id, week_start, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS duty_weeks_round ON duty_weeks (class_id, round)`,
  `CREATE TABLE IF NOT EXISTS duty_skips (
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     week_start TEXT NOT NULL,
     PRIMARY KEY (class_id, week_start)
   )`,
  `CREATE TABLE IF NOT EXISTS cash_requests (
     id INTEGER PRIMARY KEY,
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     group_id INTEGER,
     audience TEXT NOT NULL DEFAULT '',
     title TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
     due_date TEXT,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at INTEGER NOT NULL,
     closed_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS cash_requests_class ON cash_requests (class_id, closed_at)`,
  `CREATE TABLE IF NOT EXISTS cash_payments (
     id INTEGER PRIMARY KEY,
     request_id INTEGER NOT NULL REFERENCES cash_requests(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
     method TEXT CHECK (method IN ('cash', 'stripe')),
     paid_at INTEGER,
     marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     stripe_session TEXT,
     UNIQUE (request_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS cash_payments_user ON cash_payments (user_id)`,
  `CREATE TABLE IF NOT EXISTS cash_sessions (
     session_id TEXT PRIMARY KEY,
     payment_id INTEGER NOT NULL REFERENCES cash_payments(id) ON DELETE CASCADE,
     amount_cents INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cash_events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS cash_log (
     id INTEGER PRIMARY KEY,
     class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
     request_id INTEGER,
     payment_id INTEGER,
     actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     action TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS cash_log_request ON cash_log (request_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS study_progress (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
     known TEXT NOT NULL DEFAULT '[]',
     quiz_right INTEGER,
     quiz_total INTEGER,
     quiz_best INTEGER,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, test_id)
   )`,
  `CREATE TABLE IF NOT EXISTS study_sets (
     test_id INTEGER PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     step INTEGER NOT NULL DEFAULT 0,
     summary TEXT NOT NULL DEFAULT '',
     cards TEXT NOT NULL DEFAULT '[]',
     quiz TEXT NOT NULL DEFAULT '[]',
     model TEXT NOT NULL DEFAULT '',
     started_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     started_at INTEGER NOT NULL,
     created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS note_versions (
     id INTEGER PRIMARY KEY,
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     text TEXT NOT NULL,
     board TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     reason TEXT NOT NULL DEFAULT 'auto'
   )`,
  `CREATE INDEX IF NOT EXISTS note_versions_note ON note_versions (note_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at)`,
  `CREATE INDEX IF NOT EXISTS messages_user_unread ON messages (user_id, read_at)`,
  `CREATE INDEX IF NOT EXISTS rate_limits_reset ON rate_limits (reset_at)`,
  `CREATE TABLE IF NOT EXISTS avatars (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     mime TEXT NOT NULL,
     data BLOB NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS todoist_accounts (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     token_enc TEXT NOT NULL,
     project_id TEXT,
     project_name TEXT NOT NULL DEFAULT 'Classmate',
     last_sync_at INTEGER,
     last_error TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS todoist_links (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     task_id INTEGER NOT NULL,
     todoist_id TEXT NOT NULL,
     hash TEXT NOT NULL,
     state INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, task_id)
   )`,
  `CREATE TABLE IF NOT EXISTS strava_accounts (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     username TEXT NOT NULL,
     password_enc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     canteen TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS mail_accounts (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     address TEXT NOT NULL,
     secret_enc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_ok_at INTEGER,
     PRIMARY KEY (user_id, kind)
   )`,
  `CREATE TABLE IF NOT EXISTS subject_summaries (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
     slot TEXT NOT NULL,
     text TEXT NOT NULL,
     model TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, subject_id)
   )`,
  `CREATE TABLE IF NOT EXISTS calendar_feeds (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE,
     token_enc TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER,
     kinds TEXT NOT NULL DEFAULT 'test,task,change,event'
   )`,
  `CREATE TABLE IF NOT EXISTS custom_events (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     title TEXT NOT NULL,
     start_time TEXT,
     end_time TEXT,
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
     updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     updated_at INTEGER,
     private INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS custom_events_user_date ON custom_events (user_id, date)`,
  `CREATE INDEX IF NOT EXISTS custom_events_class_date ON custom_events (class_id, date)`,
  `CREATE TABLE IF NOT EXISTS note_audio (
     id INTEGER PRIMARY KEY,
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     mime TEXT NOT NULL,
     file TEXT NOT NULL,
     size INTEGER NOT NULL,
     duration INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS note_audio_note ON note_audio (note_id)`,
  `CREATE INDEX IF NOT EXISTS note_audio_user ON note_audio (user_id)`,
  `CREATE TABLE IF NOT EXISTS note_files (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  file TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS note_files_note ON note_files (note_id)`,
  `CREATE INDEX IF NOT EXISTS note_files_user ON note_files (user_id)`,
  `CREATE TABLE IF NOT EXISTS note_images (
     id INTEGER PRIMARY KEY,
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     file TEXT NOT NULL,
     mime TEXT NOT NULL,
     size INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS note_images_note ON note_images (note_id)`,
  `CREATE INDEX IF NOT EXISTS note_images_user ON note_images (user_id)`,
  `CREATE TABLE IF NOT EXISTS note_collaborators (
     note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (note_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS note_collaborators_user ON note_collaborators (user_id)`,
  `CREATE TABLE IF NOT EXISTS note_ydocs (
     note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
     state BLOB NOT NULL,
     rev INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS training_profiles (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     enabled INTEGER NOT NULL DEFAULT 1,
     sport TEXT NOT NULL DEFAULT '', club TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', frequency TEXT NOT NULL DEFAULT '', teacher TEXT NOT NULL DEFAULT '',
     submit1 TEXT NOT NULL DEFAULT '', submit2 TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS training_entries (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     date TEXT NOT NULL, type TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, rpe INTEGER,
     content TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS training_entries_user ON training_entries (user_id, date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS training_entries_ext ON training_entries (user_id, source, ext_id) WHERE ext_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS training_reflections (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     week_from TEXT NOT NULL, week_to TEXT NOT NULL,
     goal TEXT NOT NULL DEFAULT '', achieved TEXT NOT NULL DEFAULT '', improve TEXT NOT NULL DEFAULT '', rating INTEGER,
     filled_on TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS training_reflections_user ON training_reflections (user_id, week_from)`,
  `CREATE TABLE IF NOT EXISTS intervals_accounts (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     athlete_id TEXT NOT NULL DEFAULT '0', key_enc TEXT NOT NULL,
     last_sync_at INTEGER, created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS inquiries (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     contact TEXT NOT NULL,
     school TEXT NOT NULL DEFAULT '',
     message TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     handled_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (day, user_id)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS usage_hourly (slot INTEGER PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS usage_counts (day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind)) WITHOUT ROWID`,
];

const COLUMNS: [table: string, column: string, ddl: string][] = [
  ["cash_payments", "stripe_session", "TEXT"],
  ["classes", "duty_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["classes", "board_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "duty_skip", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "board_on", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "board_hidden", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "board_mail_off", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "board_banned", "INTEGER NOT NULL DEFAULT 0"],
  ["classes", "cash_personal", "INTEGER NOT NULL DEFAULT 1"],
  ["cash_payments", "exempt", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "placeholder", "INTEGER NOT NULL DEFAULT 0"],
  ["stat_marks", "weight", "REAL NOT NULL DEFAULT 1"],
  ["notes", "unshared", "INTEGER NOT NULL DEFAULT 0"],
  ["cash_requests", "people_only", "INTEGER NOT NULL DEFAULT 0"],
  ["cash_payments", "amount_cents", "INTEGER"],
  ["classes", "roster", "TEXT NOT NULL DEFAULT ''"],
  ["todoist_accounts", "sync_token", "TEXT"],
  ["todoist_accounts", "auth", "TEXT NOT NULL DEFAULT 'token'"],
  ["todoist_accounts", "refresh_enc", "TEXT"],
  ["todoist_accounts", "expires_at", "INTEGER"],
  ["cash_payments", "claimed_at", "INTEGER"],
  ["cash_payments", "claim_method", "TEXT"],
  ["classes", "cash_iban", "TEXT"],
  ["classes", "cash_account_name", "TEXT"],
  ["classes", "cash_qr", "INTEGER NOT NULL DEFAULT 0"],
  ["classes", "cash_card", "INTEGER NOT NULL DEFAULT 1"],
  ["classes", "cash_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["classes", "stripe_key_enc", "TEXT"],
  ["classes", "stripe_webhook_enc", "TEXT"],
  ["users", "treasurer", "INTEGER NOT NULL DEFAULT 0"],
  ["study_sets", "fingerprint", "TEXT NOT NULL DEFAULT ''"],
  ["study_sets", "regenerating", "INTEGER NOT NULL DEFAULT 0"],
  ["notes", "board", "TEXT NOT NULL DEFAULT ''"],
  ["notes", "rev", "INTEGER NOT NULL DEFAULT 0"],
  ["notes", "board_rev", "INTEGER NOT NULL DEFAULT 0"],
  ["notes", "deleted_at", "INTEGER"],
  ["schools", "strava_canteen", "TEXT"],
  ["schools", "training_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "last_active_at", "INTEGER"],
  ["strava_accounts", "canteen", "TEXT NOT NULL DEFAULT ''"],
  ["schools", "ms_domain", "TEXT"],
  ["schools", "ms_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["schools", "any_class", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "bk_profile_at", "INTEGER"],
  ["schools", "mail_kind", "TEXT"],
  ["schools", "mail_domain", "TEXT"],
  ["schools", "mail_imap_host", "TEXT"],
  ["schools", "mail_imap_port", "INTEGER"],
  ["schools", "mail_smtp_host", "TEXT"],
  ["schools", "mail_smtp_port", "INTEGER"],
  ["users", "shortcuts", "TEXT"],
  ["users", "ui_prefs", "TEXT"],
  ["users", "socials", "TEXT"],
  ["users", "demo_expires_at", "INTEGER"],
  ["schools", "demo", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "email_notify", "TEXT NOT NULL DEFAULT 'off'"],
  ["users", "email_confirmed_for", "TEXT"],
  ["users", "email_digest_on", "TEXT"],
  ["users", "email_gate", "INTEGER NOT NULL DEFAULT 0"],
  ["messages", "emailed_at", "INTEGER"],
  ["messages", "pushed_at", "INTEGER"],
  ["calendar_feeds", "kinds", "TEXT NOT NULL DEFAULT 'test,task,change,event'"],
  ["custom_events", "class_id", "INTEGER REFERENCES classes(id) ON DELETE CASCADE"],
  ["custom_events", "updated_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["custom_events", "updated_at", "INTEGER"],
  ["tasks", "private", "INTEGER NOT NULL DEFAULT 0"],
  ["tests", "private", "INTEGER NOT NULL DEFAULT 0"],
  ["tests", "makeup", "INTEGER NOT NULL DEFAULT 0"],
  ["tests", "oral", "INTEGER NOT NULL DEFAULT 0"],
  ["custom_events", "private", "INTEGER NOT NULL DEFAULT 0"],
  ["tasks", "updated_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["tasks", "updated_at", "INTEGER"],
  ["tests", "updated_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["tests", "updated_at", "INTEGER"],
];

export function repairSchema(conn: Database.Database) {
  const fixed: string[] = [];
  const tableExists = (t: string) => !!conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  for (const sql of TABLES) {
    const name = /(?:TABLE|INDEX) IF NOT EXISTS (\w+)/.exec(sql)?.[1];
    const existed = name ? !!conn.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name) : true;
    conn.exec(sql);
    if (!existed) fixed.push(name!);
  }
  for (const [table, column, ddl] of COLUMNS) {
    if (!tableExists(table)) continue;
    const has = (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
    if (!has) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      fixed.push(`${table}.${column}`);
    }
  }
  if (tableExists("custom_events")) conn.exec("UPDATE custom_events SET class_id = (SELECT class_id FROM users WHERE users.id = custom_events.user_id) WHERE class_id IS NULL");
  if (fixed.length) console.warn("Schéma databáze bylo doplněno:", fixed.join(", "));
}
