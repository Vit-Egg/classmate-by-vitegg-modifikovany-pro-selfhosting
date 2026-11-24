/** Migrace se aplikují postupně a jen jednou. Nikdy neupravuj už nasazenou – přidej novou. */
export const migrations: { id: number; sql: string; /** přestavba tabulky: běží s vypnutými cizími klíči (jinak by DROP smazal navázané řádky) */ rebuild?: boolean }[] = [
  {
    id: 1,
    sql: `
CREATE TABLE schools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  bakalari_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (school_id, name)
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  bakalari_username TEXT,
  bakalari_refresh_enc TEXT,
  last_sync_at INTEGER,
  totp_secret_enc TEXT,
  totp_pending_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_bakalari ON users (school_id, bakalari_username) WHERE bakalari_username IS NOT NULL;
CREATE INDEX users_class ON users (class_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE TABLE login_challenges (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE recovery_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER
);
CREATE INDEX recovery_user ON recovery_codes (user_id);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- Předměty a skupiny jsou sdílené v rámci třídy, zdrojem pravdy je Bakaláři.
CREATE TABLE subjects (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  bk_id TEXT NOT NULL,
  name TEXT NOT NULL,
  abbrev TEXT NOT NULL,
  hue TEXT NOT NULL,
  UNIQUE (class_id, bk_id)
);
CREATE TABLE groups (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  bk_id TEXT NOT NULL,
  label TEXT NOT NULL,
  whole_class INTEGER NOT NULL DEFAULT 0,
  UNIQUE (class_id, bk_id)
);
-- Které předměty má uživatel a v jaké skupině.
CREATE TABLE user_subjects (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, subject_id, group_id)
);
-- Cache odpovědí z Bakalářů (rozvrh, známky). Jde kdykoliv smazat.
CREATE TABLE cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Obsah zadávaný uživateli. group_id NULL = vidí celá třída.
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX tasks_class ON tasks (class_id);
CREATE TABLE task_done (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE tests (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX tests_class_date ON tests (class_id, date);

-- Školu a správce vytvoří průvodce při prvním spuštění serveru (/zprovozneni).
`,
  },
  {
    id: 2,
    sql: `
-- Soukromé poznámky uživatele. content = JSON dokument editoru (Tiptap/ProseMirror), text = prostý text pro hledání a náhledy.
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX notes_user ON notes (user_id, pinned DESC, updated_at DESC);
`,
  },
  {
    id: 3,
    sql: `
-- OAuth 2.1 pro MCP: dynamicky registrovaní klienti, jednorázové kódy a tokeny (v DB jen hashe).
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  access_expires INTEGER NOT NULL,
  refresh_expires INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX oauth_tokens_user ON oauth_tokens (user_id);
`,
  },
  {
    id: 4,
    rebuild: true,
    sql: `
-- Úkol může být bez předmětu (subject_id už není povinné).
CREATE TABLE tasks_new (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO tasks_new (id, class_id, group_id, subject_id, title, note, due_date, created_by, created_at)
  SELECT id, class_id, group_id, subject_id, title, note, due_date, created_by, created_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_class ON tasks (class_id);

-- Sdílení poznámek se třídou: u jednotlivé poznámky, nebo u všech (i budoucích) přepínačem u uživatele.
ALTER TABLE notes ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN share_notes INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 5,
    sql: `
-- Vlastní výchozí název nové poznámky (šablona se značkami {den}, {datum}, …).
ALTER TABLE users ADD COLUMN note_title_template TEXT;
-- Souhlas se sdílením známek do anonymních statistik: NULL = ještě se neptali, 0 = nepovoleno, 1 = povoleno.
ALTER TABLE users ADD COLUMN share_marks_stats INTEGER;
-- Příspěvky do statistik. Bez ID uživatele: contributor je HMAC (nejde zpětně převést na uživatele bez tajného klíče).
CREATE TABLE stat_marks (
  mark_key TEXT NOT NULL,
  contributor TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (mark_key, contributor)
);
CREATE INDEX stat_marks_contributor ON stat_marks (contributor);
`,
  },
  {
    id: 6,
    sql: `
-- Zprávy (oznámení): změny v rozvrhu, nové známky, absence, úkoly a testy od spolužáků.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE (user_id, key)
);
CREATE INDEX messages_user ON messages (user_id, created_at DESC);
-- Vypnuté kategorie zpráv (JSON pole).
ALTER TABLE users ADD COLUMN msg_off TEXT;
`,
  },
  {
    id: 7,
    sql: `
-- Web Push: odběry upozornění (jedno zařízení / prohlížeč = jeden řádek).
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);
CREATE INDEX push_user ON push_subscriptions (user_id);
`,
  },
  {
    id: 8,
    sql: `
-- Odebíratelný kalendář (webcal): tajný odkaz, v DB jen otisk pro vyhledání a zašifrovaná podoba pro zobrazení.
CREATE TABLE calendar_feeds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
`,
  },
  {
    id: 9,
    sql: `
-- Které druhy termínů jsou v odebíraném kalendáři (čárkami oddělená pole).
ALTER TABLE calendar_feeds ADD COLUMN kinds TEXT NOT NULL DEFAULT 'test,task,change,event';
`,
  },
  {
    id: 10,
    sql: `
-- Vlastní události v kalendáři (osobní, vidí je jen autor).
CREATE TABLE custom_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX custom_events_user_date ON custom_events (user_id, date);
`,
  },
  {
    id: 11,
    sql: `
-- Vlastní klávesové zkratky (JSON jen s odchylkami od výchozích).
ALTER TABLE users ADD COLUMN shortcuts TEXT;
`,
  },
  {
    id: 12,
    sql: `
-- Zapamatované volby zobrazení (kalendář, rozvrh) u účtu, aby platily na všech zařízeních a nezmizely s cookies.
ALTER TABLE users ADD COLUMN ui_prefs TEXT;
`,
  },
  {
    id: 13,
    sql: `
-- Nahrávky k poznámkám (soubory leží v DATA_DIR/audio, tady jsou jen údaje o nich).
CREATE TABLE note_audio (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  file TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_audio_note ON note_audio (note_id);
CREATE INDEX note_audio_user ON note_audio (user_id);
`,
  },
  {
    id: 14,
    sql: `
-- Zprávy od zájemců z úvodní stránky (třída nebo škola, která chce Školu pořídit).
CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  school TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
`,
  },
  {
    id: 15,
    sql: `
-- Vlastní události jsou pro celou třídu (školní akce apod.). user_id je autor, class_id určuje, kdo je vidí.
ALTER TABLE custom_events ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE;
UPDATE custom_events SET class_id = (SELECT class_id FROM users WHERE users.id = custom_events.user_id);
CREATE INDEX custom_events_class_date ON custom_events (class_id, date);
`,
  },
  {
    id: 16,
    sql: `
-- Kdo položku naposled upravil a kdy (u testů, úkolů a událostí třídy).
ALTER TABLE tasks ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN updated_at INTEGER;
ALTER TABLE tests ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tests ADD COLUMN updated_at INTEGER;
ALTER TABLE custom_events ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE custom_events ADD COLUMN updated_at INTEGER;
`,
  },
  {
    id: 17,
    sql: `
-- E-mailová upozornění: režim (off / instant / digest), adresa, kterou uživatel potvrdil, a kdy se naposled poslal denní souhrn.
ALTER TABLE users ADD COLUMN email_notify TEXT NOT NULL DEFAULT 'off';
ALTER TABLE users ADD COLUMN email_confirmed_for TEXT;
ALTER TABLE users ADD COLUMN email_digest_on TEXT;
-- Kdy byla zpráva odeslána e-mailem (NULL = ještě ne).
ALTER TABLE messages ADD COLUMN emailed_at INTEGER;
`,
  },
  {
    id: 18,
    sql: `
-- Nově zaregistrovaný uživatel musí potvrdit e-mail, než aplikaci použije (1 = brána zapnutá; starší účty ji nemají).
ALTER TABLE users ADD COLUMN email_gate INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 19,
    sql: `
-- Položky „jen pro mě“ (úkoly, testy, události): vidí je jen autor, spolužákům se neposílají zprávy.
ALTER TABLE tasks ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_events ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 20,
    sql: `
-- Obrázky vložené do poznámek (soubory leží v DATA_DIR/images).
CREATE TABLE note_images (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_images_note ON note_images (note_id);
CREATE INDEX note_images_user ON note_images (user_id);
`,
  },
  {
    id: 21,
    sql: `
-- Test v náhradním termínu (pro ty, kdo psali původní test později nebo vůbec).
ALTER TABLE tests ADD COLUMN makeup INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 22,
    sql: `
-- Shrnutí předmětu pro uživatele; jeden řádek na předmět, platí do konce půldne (slot).
CREATE TABLE subject_summaries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  text TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject_id)
);
`,
  },
  {
    id: 23,
    sql: `
-- Školní e-mail: nastavení u školy (kdo ho hostuje) a propojený účet uživatele.
ALTER TABLE schools ADD COLUMN mail_kind TEXT;
ALTER TABLE schools ADD COLUMN mail_domain TEXT;
ALTER TABLE schools ADD COLUMN mail_imap_host TEXT;
ALTER TABLE schools ADD COLUMN mail_imap_port INTEGER;
ALTER TABLE schools ADD COLUMN mail_smtp_host TEXT;
ALTER TABLE schools ADD COLUMN mail_smtp_port INTEGER;
UPDATE schools SET mail_kind = 'microsoft', mail_domain = 'ssps.cz' WHERE name = 'SSPŠ';
CREATE TABLE mail_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  address TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);
`,
  },
  {
    id: 24,
    sql: `
-- Microsoft 365 se nastavuje zvlášť (koncovka školy), pošta je jen volba; účty Microsoft a IMAP mohou existovat vedle sebe.
ALTER TABLE schools ADD COLUMN ms_domain TEXT;
UPDATE schools SET ms_domain = mail_domain, mail_domain = NULL WHERE mail_kind = 'microsoft';
CREATE TABLE mail_accounts_new (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  address TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  PRIMARY KEY (user_id, kind)
);
INSERT INTO mail_accounts_new (user_id, kind, address, secret_enc, created_at, last_ok_at) SELECT user_id, kind, address, secret_enc, created_at, last_ok_at FROM mail_accounts;
DROP TABLE mail_accounts;
ALTER TABLE mail_accounts_new RENAME TO mail_accounts;
`,
  },
  {
    id: 25,
    sql: `
-- Microsoft 365 u školy jde zapnout a vypnout, aniž by se ztratila koncovka.
ALTER TABLE schools ADD COLUMN ms_enabled INTEGER NOT NULL DEFAULT 0;
UPDATE schools SET ms_enabled = 1 WHERE ms_domain IS NOT NULL AND ms_domain != '';
`,
  },
  {
    id: 26,
    sql: `
-- Strava.cz (školní obědy): číslo jídelny u školy a účet uživatele (heslo šifrované, Strava.cz nemá obnovovací token).
ALTER TABLE schools ADD COLUMN strava_canteen TEXT;
CREATE TABLE strava_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`,
  },
  {
    id: 27,
    sql: `
-- Strava.cz si zapíná každý student sám: číslo jídelny je u jeho účtu, ne u školy.
ALTER TABLE strava_accounts ADD COLUMN canteen TEXT NOT NULL DEFAULT '';
UPDATE strava_accounts SET canteen = COALESCE((SELECT s.strava_canteen FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = strava_accounts.user_id), '');
`,
  },
  {
    id: 28,
    sql: `
-- Tabule (Excalidraw) u poznámky: JSON scény.
ALTER TABLE notes ADD COLUMN board TEXT NOT NULL DEFAULT '';
`,
  },
  {
    id: 29,
    sql: `
-- Ochrana poznámek: čísla verzí (proti přepsání z druhého okna), historie verzí a koš.
ALTER TABLE notes ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN board_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN deleted_at INTEGER;
CREATE TABLE note_versions (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  text TEXT NOT NULL,
  board TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'auto'
);
CREATE INDEX note_versions_note ON note_versions (note_id, created_at DESC);
`,
  },
  {
    id: 30,
    sql: `
-- Fronta push upozornění: zpráva se odešle, jakmile to jde (po nočním klidu, po chybě), a označí se tím.
ALTER TABLE messages ADD COLUMN pushed_at INTEGER;
UPDATE messages SET pushed_at = created_at;
CREATE INDEX messages_unpushed ON messages (pushed_at) WHERE pushed_at IS NULL;
`,
  },
  {
    id: 31,
    sql: `
-- Nastavení celé aplikace (zatím umělá inteligence), spravuje se ve Správě.
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
  {
    id: 32,
    sql: `
-- Studijní sada k testu (souhrn, kartičky, procvičování), jedna pro všechny, komu test platí. Zmizí s testem i po jeho termínu.
CREATE TABLE study_sets (
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
);
`,
  },
  {
    id: 33,
    sql: `
-- Studium: otisk podkladů (aby šlo poznat, že se změnily), přegenerování a postup každého uživatele.
ALTER TABLE study_sets ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE study_sets ADD COLUMN regenerating INTEGER NOT NULL DEFAULT 0;
CREATE TABLE study_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  known TEXT NOT NULL DEFAULT '[]',
  quiz_right INTEGER,
  quiz_total INTEGER,
  quiz_best INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, test_id)
);
`,
  },
  {
    id: 34,
    sql: `
-- Pokladna: volitelný modul po třídách. Peníze v haléřích (celá čísla), platby po jednom řádku na člena, audit všech změn.
ALTER TABLE classes ADD COLUMN cash_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE classes ADD COLUMN stripe_key_enc TEXT;
ALTER TABLE classes ADD COLUMN stripe_webhook_enc TEXT;
ALTER TABLE users ADD COLUMN treasurer INTEGER NOT NULL DEFAULT 0;
CREATE TABLE cash_requests (
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
);
CREATE INDEX cash_requests_class ON cash_requests (class_id, closed_at);
CREATE TABLE cash_payments (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES cash_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  method TEXT CHECK (method IN ('cash', 'stripe')),
  paid_at INTEGER,
  marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stripe_session TEXT,
  UNIQUE (request_id, user_id)
);
CREATE INDEX cash_payments_user ON cash_payments (user_id);
CREATE TABLE cash_sessions (
  session_id TEXT PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES cash_payments(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE cash_events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE cash_log (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  request_id INTEGER,
  payment_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX cash_log_request ON cash_log (request_id, created_at);
`,
  },
  {
    id: 35,
    sql: `
-- Třídní služby: volitelný modul po třídách. Každý týden (pondělí) slouží dva lidé, další kolo začne, až odslouží všichni.
ALTER TABLE classes ADD COLUMN duty_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN duty_skip INTEGER NOT NULL DEFAULT 0;
CREATE TABLE duty_weeks (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  PRIMARY KEY (class_id, week_start, user_id)
);
CREATE INDEX duty_weeks_round ON duty_weeks (class_id, round);
CREATE TABLE duty_skips (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  PRIMARY KEY (class_id, week_start)
);
`,
  },
  {
    id: 36,
    sql: `
-- Pokladna: platba QR kódem na účet třídy a vypínač karty (klíče Stripe zůstanou uložené).
ALTER TABLE classes ADD COLUMN cash_iban TEXT;
ALTER TABLE classes ADD COLUMN cash_account_name TEXT;
ALTER TABLE classes ADD COLUMN cash_qr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE classes ADD COLUMN cash_card INTEGER NOT NULL DEFAULT 1;
`,
  },
  {
    id: 37,
    sql: `
-- Pokladna: způsoby platby po třídách (osobně / QR / karta) a „už jsem zaplatil“ od člena, které pokladník potvrdí nebo odmítne.
ALTER TABLE classes ADD COLUMN cash_personal INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cash_payments ADD COLUMN claimed_at INTEGER;
ALTER TABLE cash_payments ADD COLUMN claim_method TEXT;
`,
  },
  {
    id: 38,
    sql: `
-- Pokladna: pokladník může u člena u dané platby označit „nemusí platit“, člen se pak nepočítá do celkové částky.
ALTER TABLE cash_payments ADD COLUMN exempt INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 39,
    sql: `
-- Todoist: osobní API token uživatele (šifrovaný) a vazba úkolů z Classmate na položky v jeho Todoistu.
CREATE TABLE todoist_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_enc TEXT NOT NULL,
  project_id TEXT,
  project_name TEXT NOT NULL DEFAULT 'Classmate',
  last_sync_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE todoist_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- bez cizího klíče na tasks: po smazání úkolu je potřeba z vazby poznat položku v Todoistu a odstranit ji i tam
  task_id INTEGER NOT NULL,
  todoist_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  -- 0 = otevřená položka v Todoistu, 1 = dokončená, 2 = v Todoistu ji uživatel smazal (už se nezakládá znovu)
  state INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, task_id)
);
`,
  },
  {
    id: 40,
    sql: `
-- Neregistrovaný člen třídy (účet bez přihlášení), kterého založil správce: počítá se do plateb, služeb i seznamu, dokud ho správce nesmaže.
ALTER TABLE users ADD COLUMN placeholder INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 41,
    sql: `
-- Profilovky: malý obrázek (zmenšený v prohlížeči) přímo v databázi, ať je součástí záloh.
CREATE TABLE avatars (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
`,
  },
  {
    id: 42,
    sql: `
-- Rychlejší úklid a počítání nepřečtených zpráv.
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS messages_user_unread ON messages (user_id, read_at);
CREATE INDEX IF NOT EXISTS rate_limits_reset ON rate_limits (reset_at);
`,
  },
  {
    id: 43,
    sql: `
-- Todoist obousměrně: token pro přírůstkové načítání změn a způsob přihlášení (token / oauth).
ALTER TABLE todoist_accounts ADD COLUMN sync_token TEXT;
ALTER TABLE todoist_accounts ADD COLUMN auth TEXT NOT NULL DEFAULT 'token';
`,
  },
  {
    id: 44,
    sql: `
-- Anonymní statistiky: váha známky, aby šel spočítat celkový vážený průměr každého přispěvatele (průměr třídy z osobních průměrů).
ALTER TABLE stat_marks ADD COLUMN weight REAL NOT NULL DEFAULT 1;
`,
  },
  {
    id: 45,
    sql: `
-- Při zapnutém „sdílet všechny poznámky“ jde jednotlivá poznámka vyřadit (1 = nesdílet tuto poznámku).
ALTER TABLE notes ADD COLUMN unshared INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 46,
    sql: `
-- Mobilní aplikace: spárovaná zařízení. Token zařízení (v DB jen jeho otisk) slouží k /api/app/…, fcm_token k push přes Firebase.
CREATE TABLE app_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  fcm_token TEXT,
  app_version TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX app_devices_user ON app_devices (user_id);
`,
  },
  {
    id: 47,
    sql: `
-- Ukázkový účet (src/lib/demo.ts): 1 = účet s vymyšlenými daty bez Bakalářů (např. pro recenzenta obchodu).
ALTER TABLE users ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 48,
    sql: `
-- Seznam studentů třídy (jedno jméno na řádek): do třídy se dá zaregistrovat jen člověk ze seznamu. Základ vznikne ze současných členů třídy (i neregistrovaných).
ALTER TABLE classes ADD COLUMN roster TEXT NOT NULL DEFAULT '';
UPDATE classes SET roster = COALESCE((SELECT group_concat(name, char(10)) FROM (SELECT name FROM users WHERE class_id = classes.id ORDER BY name COLLATE NOCASE)), '');
`,
  },
  {
    id: 49,
    sql: `
-- Pokladna: platba jen pro vybrané lidi (people_only = řádky se nedoplňují samy) a vlastní částka u jednotlivé platby (NULL = částka požadavku).
ALTER TABLE cash_requests ADD COLUMN people_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_payments ADD COLUMN amount_cents INTEGER CHECK (amount_cents IS NULL OR (amount_cents > 0 AND amount_cents <= 10000000));
`,
  },
  {
    id: 50,
    sql: `
-- Společná úprava poznámky: vlastník pozve spolužáka, který ji pak vidí a upravuje spolu s ním. note_ydocs = stav sdíleného dokumentu (Yjs); rev = verze poznámky, ke které patří (když se poznámka změní jinak, dokument se postaví znovu).
CREATE TABLE note_collaborators (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX note_collaborators_user ON note_collaborators (user_id);
CREATE TABLE note_ydocs (
  note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  state BLOB NOT NULL,
  rev INTEGER NOT NULL
);
`,
  },
  {
    id: 51,
    sql: `
-- Tréninkový deník (program Aktivní sportovec): škola modul povolí, každý žák si ho zapne sám. Údaje z hlavičky tabulky, zápisy aktivit, týdenní reflexe a propojení s Intervals.icu (API klíč šifrovaně).
ALTER TABLE schools ADD COLUMN training_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE training_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  sport TEXT NOT NULL DEFAULT '',
  club TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  teacher TEXT NOT NULL DEFAULT '',
  submit1 TEXT NOT NULL DEFAULT '',
  submit2 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE training_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  rpe INTEGER,
  content TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  ext_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX training_entries_user ON training_entries (user_id, date);
CREATE UNIQUE INDEX training_entries_ext ON training_entries (user_id, source, ext_id) WHERE ext_id IS NOT NULL;
CREATE TABLE training_reflections (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_from TEXT NOT NULL,
  week_to TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  achieved TEXT NOT NULL DEFAULT '',
  improve TEXT NOT NULL DEFAULT '',
  rating INTEGER,
  filled_on TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX training_reflections_user ON training_reflections (user_id, week_from);
CREATE TABLE intervals_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL DEFAULT '0',
  key_enc TEXT NOT NULL,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL
);
`,
  },
  {
    id: 52,
    sql: `
-- Kdy byl uživatel naposled v aplikaci (otevřená stránka, ne synchronizace na pozadí). Pro Správu.
ALTER TABLE users ADD COLUMN last_active_at INTEGER;
UPDATE users SET last_active_at = (SELECT MAX(last_seen) FROM sessions WHERE user_id = users.id);
`,
  },
  {
    id: 53,
    sql: `
-- Přílohy k poznámkám (PDF, dokumenty, obrázky); soubory leží v DATA_DIR/files, tady jsou jen údaje o nich.
CREATE TABLE note_files (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  file TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_files_note ON note_files (note_id);
CREATE INDEX note_files_user ON note_files (user_id);
`,
  },
  {
    id: 54,
    sql: `
ALTER TABLE tests ADD COLUMN oral INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 55,
    sql: `
-- Náhradní termíny: každý si u nich zvolí, jestli test píše (1), nebo nepíše (0). Bez volby se ukazují nevýrazně, při 0 se skryjí.
CREATE TABLE test_attend (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  writes INTEGER NOT NULL,
  PRIMARY KEY (user_id, test_id)
);
`,
  },
  {
    id: 56,
    sql: `
-- Moje hodnocení poznámky (jen pro mě): jak jsem látku pochopil(a) a jak jsem se soustředil(a), každé 1 až 5 a krátký komentář.
CREATE TABLE note_reflections (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  understanding INTEGER,
  understanding_note TEXT NOT NULL DEFAULT '',
  focus INTEGER,
  focus_note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, note_id)
);
`,
  },
  {
    id: 57,
    sql: `
-- Audit log: kdo, kdy a co ve správě a u zabezpečení účtů udělal. Řádky nemají cizí klíč na uživatele, aby přežily smazání účtu
-- (při smazání účtu se jméno a IP z řádků odstraní). Starší než AUDIT_RETENTION_DAYS (výchozí 365) se mažou.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  target TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX audit_log_at ON audit_log (at DESC);
CREATE INDEX audit_log_actor ON audit_log (actor_id);
CREATE INDEX audit_log_target_user ON audit_log (target_user_id);
`,
  },
  {
    id: 58,
    sql: `
-- Sociální sítě v profilu (JSON {"instagram":"jmeno",…}); vidí je spolužáci ze třídy na stránce spolužáka.
ALTER TABLE users ADD COLUMN socials TEXT;
`,
  },
  {
    id: 59,
    sql: `
-- Veřejné demo: každý návštěvník dostane vlastní ukázkovou třídu s vymyšlenými daty, která po 24 hodinách zmizí.
-- users.demo: 0 = skutečný účet, 1 = ukázkový účet (návštěvník nebo účet pro recenzenta), 2 = vymyšlený spolužák z dema (nejde se za něj přihlásit).
-- demo_expires_at: kdy se ukázkový účet smaže (NULL = trvalý ukázkový účet z DEMO_EMAIL). schools.demo: skrytá ukázková škola (mimo registraci a Správu).
ALTER TABLE users ADD COLUMN demo_expires_at INTEGER;
ALTER TABLE schools ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
UPDATE schools SET demo = 1 WHERE name = 'Demo škola' AND bakalari_url IS NULL;
CREATE INDEX users_demo_expires ON users (demo_expires_at) WHERE demo_expires_at IS NOT NULL;
`,
  },
  {
    id: 60,
    sql: `
-- Veřejné hodnocení cizí poznámky: 1 až 5 hvězdiček a krátký komentář; vidí ho všichni, kdo poznámku smějí číst (autor i ostatní spolužáci).
CREATE TABLE note_votes (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX note_votes_user ON note_votes (user_id);
`,
  },
  {
    id: 61,
    sql: `
-- Školní nastavení registrace: 0 = do aplikace se dostanou jen studenti tříd, které správce ve škole založil (seznam povolených tříd),
-- 1 = kterákoli třída z Bakalářů školy (třída se při první registraci sama založí). Jméno i třídu vždy bere aplikace z Bakalářů.
ALTER TABLE schools ADD COLUMN any_class INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 62,
    sql: `
-- Kdy se naposledy porovnalo jméno účtu se jménem v Bakalářích (jméno se z nich přebírá při synchronizaci, NULL = ještě ne).
ALTER TABLE users ADD COLUMN bk_profile_at INTEGER;
`,
  },
  {
    id: 63,
    sql: `
-- Komentáře ke sdíleným poznámkám: píše je kdokoli, kdo poznámku smí číst; maže je autor komentáře, autor poznámky a správce.
CREATE TABLE note_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_comments_note ON note_comments (note_id, created_at);
CREATE INDEX note_comments_user ON note_comments (user_id);
`,
  },
  {
    id: 64,
    sql: `
-- Komentáře u poznámek se zrušily (stačí veřejné hodnocení poznámky), tabulka se odstraňuje.
DROP TABLE IF EXISTS note_comments;
`,
  },
  {
    id: 65,
    sql: `
-- Todoist: přístupový token z OAuth vyprší za hodinu, proto se ukládá i obnovovací token a čas vypršení.
ALTER TABLE todoist_accounts ADD COLUMN refresh_enc TEXT;
ALTER TABLE todoist_accounts ADD COLUMN expires_at INTEGER;
`,
  },
  {
    id: 66,
    sql: `
-- Statistiky používání: kdo byl který den aktivní, kolik aktivit v které hodině a počty událostí (generace AI a podobně). Jen souhrny pro správce.
CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (day, user_id)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS usage_hourly (slot INTEGER PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage_counts (day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind)) WITHOUT ROWID;
`,
  },
  {
    id: 67,
    sql: `
-- Jména: třída připsaná za jménem po čárce („Novák Jan, 1.B“) se odřízne a registrovaným uživatelům se jméno při nejbližší synchronizaci znovu přečte z Bakalářů ve správné podobě.
UPDATE users SET name = trim(substr(name, 1, instr(name, ',') - 1)) WHERE instr(name, ',') > 0 AND (name GLOB '*, [0-9].[A-Za-z]' OR name GLOB '*, [0-9][0-9].[A-Za-z]' OR name GLOB '*, [0-9].' OR name GLOB '*, [0-9]');
UPDATE users SET bk_profile_at = NULL WHERE placeholder = 0 AND demo = 0;
`,
  },
  {
    id: 68,
    sql: `
-- Oznámení od správce: naplánovaná i odeslaná (kdy, komu, jestli i e-mailem) a fronta e-mailů, která se odesílá postupně na pozadí.
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  send_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  silent INTEGER NOT NULL DEFAULT 0,
  email INTEGER NOT NULL DEFAULT 0,
  audience TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent_at INTEGER,
  recipients INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS announcements_due ON announcements (status, send_at);
CREATE TABLE IF NOT EXISTS announcement_mail (
  announcement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (announcement_id, user_id)
) WITHOUT ROWID;
`,
  },
  {
    id: 69,
    sql: `
-- Pochvaly (úspěchy): co si uživatel už vysloužil a kdy. Podmínky a texty jsou v kódu (achievements-defs.ts), tady jen odemčené.
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
) WITHOUT ROWID;
`,
  },
  {
    id: 70,
    sql: `
-- Pochvaly už nechodí jako zprávy do zvonečku (nemají se plést mezi důležité věci); starší takové zprávy pryč.
DELETE FROM messages WHERE key LIKE 'ach:%';
`,
  },
  {
    id: 71,
    sql: `
-- Žebříček v Trofejích: zúčastní se jen ten, kdo chce (board_on); správce může někoho z žebříčku vyřadit (board_banned).
ALTER TABLE users ADD COLUMN board_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN board_banned INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 72,
    sql: `
-- Nástěnka třídy (volitelný modul): příspěvky, ankety, reakce a komentáře.
ALTER TABLE classes ADD COLUMN board_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS board_posts (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  poll INTEGER NOT NULL DEFAULT 0,
  expires TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS board_posts_class ON board_posts (class_id, pinned, created_at);
CREATE TABLE IF NOT EXISTS board_options (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  pos INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS board_options_post ON board_options (post_id);
CREATE TABLE IF NOT EXISTS board_votes (
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES board_options(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS board_reactions (
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id, emoji)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS board_comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS board_comments_post ON board_comments (post_id, created_at);
CREATE TABLE IF NOT EXISTS board_seen (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seen_at INTEGER NOT NULL
);
`,
  },
  {
    id: 73,
    sql: `
-- Žebříček v Trofejích je zapnutý všem; kdo nechce, z něj odejde (board_hidden). Starý sloupec board_on se už nepoužívá.
ALTER TABLE users ADD COLUMN board_hidden INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: 74,
    sql: `
-- Nástěnka třídy: upozornění e-mailem (fronta jako u oznámení správce); každý se může z e-mailů z nástěnky odhlásit (board_mail_off).
ALTER TABLE users ADD COLUMN board_mail_off INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_posts ADD COLUMN mailed INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS board_mail (
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, user_id)
) WITHOUT ROWID;
`,
  },
];
