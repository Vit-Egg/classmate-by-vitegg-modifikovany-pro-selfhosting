/**
 * Statistiky Classmate pro správce: jen souhrny (počty, součty), žádný jednotlivý uživatel se tu neukazuje.
 * Demo účty a nezaregistrovaní ze seznamů tříd se nepočítají. Sekce jsou obalené, ať jedna chybná otázka nesloží celou stránku.
 * Aktivita po dnech a hodinách se sbírá od nasazení tabulek usage_* (touchActive), do té doby se použije odhad z vytvořeného obsahu.
 */
import fs from "node:fs";
import path from "node:path";
import { all, get } from "./db";
import { dataDir } from "./paths";
import { diskFree, diskTotal } from "./disk";
import { pragueNow } from "./dates";
import { allBkStats, processStartedAt, syncStat } from "./metrics";
import { activeDemos } from "./demo-visitor";

const DAY = 86_400_000;
const REAL_U = "(SELECT id FROM users WHERE placeholder = 0 AND demo = 0)";
const REAL_C = "(SELECT c.id FROM classes c JOIN schools s ON s.id = c.school_id WHERE s.demo = 0)";

export type Bar = { label: string; value: number; hint?: string };

const n = (sql: string, ...p: unknown[]) => get<{ n: number | null }>(sql, ...p)?.n ?? 0;
const rows = <T>(sql: string, ...p: unknown[]) => all<T>(sql, ...p);
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error("statistiky:", e);
    return fallback;
  }
}

const dayKey = (ms: number) => pragueNow(new Date(ms)).date;
const dayLabel = (iso: string) => `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`;
/** Posledních `days` kalendářních dní (pražských) včetně dneška, nejstarší první. */
function lastDays(days: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(Date.now() - i * DAY);
    if (!seen.has(k)) (seen.add(k), out.push(k));
  }
  return out;
}
function perDay(times: number[], days: number): Bar[] {
  const keys = lastDays(days);
  const m = new Map(keys.map((k) => [k, 0]));
  for (const t of times) {
    const k = dayKey(t);
    if (m.has(k)) m.set(k, m.get(k)! + 1);
  }
  return keys.map((k) => ({ label: dayLabel(k), value: m.get(k)! }));
}
const tally = (items: string[], top = 12): Bar[] => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, top);
};

function browser(ua: string) {
  if (/Claude\//.test(ua)) return "Aplikace Claude";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  if (/okhttp|Dalvik|Classmate/i.test(ua)) return "Aplikace";
  return "Jiný";
}
function osOf(ua: string) {
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Jiný";
}
const kindOf = (ua: string) => (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "Tablet" : /Mobi|iPhone|Android/.test(ua) ? "Telefon" : "Počítač");

const fileSize = (f: string) => {
  try {
    return fs.statSync(path.join(dataDir(), f)).size;
  } catch {
    return 0;
  }
};

export type StatsData = ReturnType<typeof adminStats>;

export function adminStats() {
  const now = Date.now();
  const today = pragueNow().date;
  const users = n("SELECT COUNT(*) n FROM users WHERE placeholder = 0 AND demo = 0");
  const U = "placeholder = 0 AND demo = 0";

  /* ---------- Návštěvnost a registrace ---------- */
  const people = safe(() => {
    const active = (ms: number) => n(`SELECT COUNT(*) n FROM users WHERE ${U} AND last_active_at > ?`, now - ms);
    const joined = (ms: number) => n(`SELECT COUNT(*) n FROM users WHERE ${U} AND created_at > ?`, now - ms);
    const first = get<{ t: number | null }>(`SELECT MIN(created_at) t FROM users WHERE ${U}`)?.t ?? null;
    return {
      total: users,
      schools: n("SELECT COUNT(*) n FROM schools WHERE demo = 0"),
      classes: n(`SELECT COUNT(*) n FROM classes WHERE id IN ${REAL_C}`),
      admins: n(`SELECT COUNT(*) n FROM users WHERE ${U} AND role = 'admin'`),
      placeholders: n("SELECT COUNT(*) n FROM users WHERE placeholder = 1 AND demo = 0"),
      neverOpened: n(`SELECT COUNT(*) n FROM users WHERE ${U} AND last_active_at IS NULL`),
      now: active(3600_000),
      active: { d1: active(DAY), d7: active(7 * DAY), d30: active(30 * DAY) },
      joined: { d1: joined(DAY), d7: joined(7 * DAY), d30: joined(30 * DAY) },
      firstAt: first,
      sessions: n(`SELECT COUNT(*) n FROM sessions WHERE expires_at > ? AND user_id IN ${REAL_U}`, now),
    };
  }, null);

  const createdAt = safe(() => rows<{ t: number }>(`SELECT created_at t FROM users WHERE ${U}`).map((r) => r.t), [] as number[]);
  const growth = {
    registrations: perDay(createdAt, 30),
    cumulative: (() => {
      const out: Bar[] = [];
      for (let w = 11; w >= 0; w--) {
        const end = now - w * 7 * DAY;
        out.push({ label: dayLabel(dayKey(end)), value: createdAt.filter((t) => t <= end).length });
      }
      return out;
    })(),
  };

  /** Aktivní lidé po dnech (od nasazení sběru dat). */
  const dau = safe(() => {
    const keys = lastDays(60);
    const m = new Map(rows<{ day: string; c: number }>("SELECT day, COUNT(*) c FROM usage_daily WHERE day >= ? GROUP BY day", keys[0]).map((r) => [r.day, r.c]));
    const since = get<{ d: string | null }>("SELECT MIN(day) d FROM usage_daily")?.d ?? null;
    return { days: keys.map((k) => ({ label: dayLabel(k), value: m.get(k) ?? 0 })), since };
  }, { days: [] as Bar[], since: null as string | null });

  /* ---------- Kdy se aplikace používá ---------- */
  const usage = safe(() => {
    const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const rowsH = rows<{ slot: number; hits: number }>("SELECT slot, hits FROM usage_hourly WHERE slot > ?", now - 90 * DAY);
    let total = rowsH.reduce((a, r) => a + r.hits, 0);
    let source: "measured" | "estimate" = "measured";
    let since: number | null = get<{ t: number | null }>("SELECT MIN(slot) t FROM usage_hourly")?.t ?? null;
    let list = rowsH.map((r) => ({ t: r.slot, w: r.hits }));
    if (total < 30) {
      // sběr se teprve rozjíždí: odhad z toho, co lidé vytvořili a kdy se přihlásili
      source = "estimate";
      const t = (sql: string) => rows<{ t: number }>(sql).map((r) => ({ t: r.t, w: 1 }));
      list = [
        ...t(`SELECT created_at t FROM sessions WHERE user_id IN ${REAL_U}`),
        ...t(`SELECT created_at t FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id IN ${REAL_U}) AND created_at > ${now - 90 * DAY}`),
        ...t(`SELECT created_at t FROM tasks WHERE class_id IN ${REAL_C} AND created_at > ${now - 90 * DAY}`),
        ...t(`SELECT created_at t FROM tests WHERE class_id IN ${REAL_C} AND created_at > ${now - 90 * DAY}`),
        ...t(`SELECT created_at t FROM notes WHERE user_id IN ${REAL_U} AND created_at > ${now - 90 * DAY}`),
      ];
      total = list.length;
      since = null;
    }
    for (const { t, w } of list) {
      const p = pragueNow(new Date(t));
      heat[p.dow - 1][p.hour] += w;
    }
    const byHour = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, value: heat.reduce((a, r) => a + r[h], 0) })) as Bar[];
    const byDay = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"].map((label, i) => ({ label, value: heat[i].reduce((a, v) => a + v, 0) })) as Bar[];
    let peak: { day: string; hour: number; value: number } | null = null;
    heat.forEach((r, di) => r.forEach((v, h) => { if (v > (peak?.value ?? 0)) peak = { day: byDay[di].label, hour: h, value: v }; }));
    return { heat, byHour, byDay, total, source, since, peak: peak as { day: string; hour: number; value: number } | null };
  }, { heat: [] as number[][], byHour: [] as Bar[], byDay: [] as Bar[], total: 0, source: "estimate" as "measured" | "estimate", since: null as number | null, peak: null as { day: string; hour: number; value: number } | null });

  /* ---------- Úložiště a obsah ---------- */
  const storage = safe(() => {
    const one = (table: string, extra = "") => get<{ c: number; s: number | null; d?: number | null }>(`SELECT COUNT(*) c, SUM(size) s${extra} FROM ${table} WHERE user_id IN ${REAL_U}`);
    const a = one("note_audio", ", SUM(duration) d");
    const i = one("note_images");
    const f = one("note_files");
    const db = fileSize("classmate.db");
    const wal = fileSize("classmate.db-wal");
    return {
      notes: n(`SELECT COUNT(*) n FROM notes WHERE deleted_at IS NULL AND user_id IN ${REAL_U}`),
      boards: n(`SELECT COUNT(*) n FROM notes WHERE deleted_at IS NULL AND board IS NOT NULL AND board != '' AND user_id IN ${REAL_U}`),
      shared: n(`SELECT COUNT(*) n FROM notes WHERE deleted_at IS NULL AND shared = 1 AND user_id IN ${REAL_U}`),
      collab: n("SELECT COUNT(DISTINCT note_id) n FROM note_collaborators"),
      trash: n(`SELECT COUNT(*) n FROM notes WHERE deleted_at IS NOT NULL AND user_id IN ${REAL_U}`),
      versions: n(`SELECT COUNT(*) n FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id IN ${REAL_U})`),
      chars: n(`SELECT COALESCE(SUM(LENGTH(text)),0) n FROM notes WHERE deleted_at IS NULL AND user_id IN ${REAL_U}`),
      audio: { count: a?.c ?? 0, size: a?.s ?? 0, seconds: a?.d ?? 0, users: n(`SELECT COUNT(DISTINCT user_id) n FROM note_audio WHERE user_id IN ${REAL_U}`) },
      images: { count: i?.c ?? 0, size: i?.s ?? 0 },
      files: { count: f?.c ?? 0, size: f?.s ?? 0 },
      db,
      wal,
      diskFree: diskFree(),
      diskTotal: diskTotal(),
    };
  }, null);

  const content = safe(() => {
    const up = (table: string, col: string) => n(`SELECT COUNT(*) n FROM ${table} WHERE class_id IN ${REAL_C} AND ${col} >= ?`, today);
    const aiRows = rows<{ kind: string; d1: number; d7: number; d30: number; total: number }>(
      `SELECT kind,
              COALESCE(SUM(CASE WHEN day >= ? THEN n END), 0) d1,
              COALESCE(SUM(CASE WHEN day >= ? THEN n END), 0) d7,
              COALESCE(SUM(CASE WHEN day >= ? THEN n END), 0) d30,
              SUM(n) total
       FROM usage_counts WHERE kind LIKE 'ai:%' GROUP BY kind`,
      today, dayKey(now - 6 * DAY), dayKey(now - 29 * DAY),
    );
    const aiLabel = (k: string) => ({ "ai:study": "Studijní sady", "ai:summary": "Shrnutí předmětů", "ai:study:chyba": "Studijní sady (chyba)", "ai:summary:chyba": "Shrnutí předmětů (chyba)" } as Record<string, string>)[k] ?? k.replace(/^ai:/, "");
    const aiKeys = lastDays(30);
    const aiDay = new Map(rows<{ day: string; c: number }>("SELECT day, SUM(n) c FROM usage_counts WHERE kind LIKE 'ai:%' AND kind NOT LIKE '%:chyba' AND day >= ? GROUP BY day", aiKeys[0]).map((r) => [r.day, r.c]));
    return {
      tasks: { total: n(`SELECT COUNT(*) n FROM tasks WHERE class_id IN ${REAL_C}`), upcoming: up("tasks", "due_date"), done: n(`SELECT COUNT(*) n FROM task_done WHERE user_id IN ${REAL_U}`), private: n(`SELECT COUNT(*) n FROM tasks WHERE class_id IN ${REAL_C} AND private = 1`) },
      tests: { total: n(`SELECT COUNT(*) n FROM tests WHERE class_id IN ${REAL_C}`), upcoming: up("tests", "date"), oral: n(`SELECT COUNT(*) n FROM tests WHERE class_id IN ${REAL_C} AND oral = 1`), makeup: n(`SELECT COUNT(*) n FROM tests WHERE class_id IN ${REAL_C} AND makeup = 1`) },
      events: n(`SELECT COUNT(*) n FROM custom_events WHERE user_id IN ${REAL_U}`),
      tasksPerDay: perDay(rows<{ t: number }>(`SELECT created_at t FROM tasks WHERE class_id IN ${REAL_C} AND created_at > ${now - 31 * DAY}`).map((r) => r.t), 30),
      ai: {
        sets: n("SELECT COUNT(*) n FROM study_sets WHERE status = 'done'"),
        summaries: n("SELECT COUNT(*) n FROM subject_summaries"),
        measured: aiRows.map((r) => ({ label: aiLabel(r.kind), d1: r.d1, d7: r.d7, d30: r.d30, total: r.total })),
        perDay: aiKeys.map((k) => ({ label: dayLabel(k), value: aiDay.get(k) ?? 0 })) as Bar[],
      },
    };
  }, null);

  /* ---------- Zařízení ---------- */
  const devices = safe(() => {
    const ua = rows<{ ua: string | null }>(`SELECT user_agent ua FROM sessions WHERE expires_at > ${now} AND user_id IN ${REAL_U}`).map((r) => r.ua ?? "");
    const push = rows<{ ua: string | null }>(`SELECT user_agent ua FROM push_subscriptions WHERE user_id IN ${REAL_U}`).map((r) => r.ua ?? "");
    const apps = rows<{ platform: string | null; v: string | null }>(`SELECT platform, app_version v FROM app_devices WHERE user_id IN ${REAL_U}`);
    return {
      total: ua.length,
      os: tally(ua.map(osOf)),
      browsers: tally(ua.map(browser)),
      kinds: tally(ua.map(kindOf)),
      pushBrowsers: tally(push.map(browser)),
      appPlatforms: tally(apps.map((a) => a.platform || "neznámá")),
      appVersions: tally(apps.map((a) => a.v || "neznámá"), 8),
      perUser: users ? ua.length / users : 0,
    };
  }, null);

  /* ---------- Funkce ---------- */
  const features = safe(() => {
    const c = (sql: string) => n(sql);
    const items: [string, string, number][] = [
      ["Přihlášení", "Propojené Bakaláře", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND bakalari_refresh_enc IS NOT NULL`)],
      ["Přihlášení", "Dvoufázové ověření", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND totp_enabled = 1`)],
      ["Spolupráce", "Sdílí poznámky", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND share_notes = 1`)],
      ["Spolupráce", "Sdílí známky do statistik třídy", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND share_marks_stats = 1`)],
      ["Spolupráce", "Hodnotil(a) cizí poznámku", c(`SELECT COUNT(DISTINCT user_id) n FROM note_votes WHERE user_id IN ${REAL_U}`)],
      ["Obsah", "Napsal(a) aspoň jednu poznámku", c(`SELECT COUNT(DISTINCT user_id) n FROM notes WHERE deleted_at IS NULL AND user_id IN ${REAL_U}`)],
      ["Obsah", "Nahrává hodiny", c(`SELECT COUNT(DISTINCT user_id) n FROM note_audio WHERE user_id IN ${REAL_U}`)],
      ["Obsah", "Tréninkový deník", c(`SELECT COUNT(DISTINCT user_id) n FROM training_entries WHERE user_id IN ${REAL_U}`)],
      ["Upozornění", "E-mailová upozornění", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND email_notify = 1`)],
      ["Upozornění", "Upozornění v prohlížeči", c(`SELECT COUNT(DISTINCT user_id) n FROM push_subscriptions WHERE user_id IN ${REAL_U}`)],
      ["Upozornění", "Mobilní aplikace", c(`SELECT COUNT(DISTINCT user_id) n FROM app_devices WHERE user_id IN ${REAL_U}`)],
      ["Propojení", "Kalendář v jiné aplikaci", c(`SELECT COUNT(*) n FROM calendar_feeds WHERE user_id IN ${REAL_U}`)],
      ["Propojení", "Todoist", c(`SELECT COUNT(*) n FROM todoist_accounts WHERE user_id IN ${REAL_U}`)],
      ["Propojení", "Školní e-mail (Komunikace)", c(`SELECT COUNT(*) n FROM mail_accounts WHERE user_id IN ${REAL_U}`)],
      ["Propojení", "Strava.cz (obědy)", c(`SELECT COUNT(*) n FROM strava_accounts WHERE user_id IN ${REAL_U}`)],
      ["Propojení", "Intervals.icu", c(`SELECT COUNT(*) n FROM intervals_accounts WHERE user_id IN ${REAL_U}`)],
      ["Profil", "Profilová fotka", c(`SELECT COUNT(*) n FROM avatars WHERE user_id IN ${REAL_U}`)],
      ["Profil", "Kontakty", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND socials IS NOT NULL AND socials NOT IN ('', '{}', '[]')`)],
      ["Profil", "Vlastní klávesové zkratky", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND shortcuts IS NOT NULL AND shortcuts NOT IN ('', '{}')`)],
      ["Třída", "Pokladník", c(`SELECT COUNT(*) n FROM users WHERE ${U} AND treasurer = 1`)],
    ];
    return items.map(([group, label, value]) => ({ group, label, value, share: users ? value / users : 0 }));
  }, [] as { group: string; label: string; value: number; share: number }[]);

  /* ---------- Peníze ---------- */
  const money = safe(() => {
    const paid = get<{ c: number; s: number | null }>(`SELECT COUNT(*) c, SUM(COALESCE(p.amount_cents, r.amount_cents)) s FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.status = 'paid' AND p.exempt = 0 AND r.class_id IN ${REAL_C}`);
    const unpaid = get<{ c: number; s: number | null }>(`SELECT COUNT(*) c, SUM(COALESCE(p.amount_cents, r.amount_cents)) s FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.status = 'unpaid' AND p.exempt = 0 AND r.closed_at IS NULL AND r.class_id IN ${REAL_C}`);
    const byMethod = rows<{ m: string | null; c: number; s: number | null }>(`SELECT p.method m, COUNT(*) c, SUM(COALESCE(p.amount_cents, r.amount_cents)) s FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.status = 'paid' AND p.exempt = 0 AND r.class_id IN ${REAL_C} GROUP BY p.method`);
    const label = (m: string | null) => (m === "cash" ? "Hotově" : m === "stripe" ? "Kartou (Stripe)" : "Neuvedeno");
    const monthly = rows<{ t: number; a: number }>(`SELECT p.paid_at t, COALESCE(p.amount_cents, r.amount_cents) a FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.status = 'paid' AND p.exempt = 0 AND p.paid_at IS NOT NULL AND r.class_id IN ${REAL_C} AND p.paid_at > ${now - 366 * DAY}`);
    const months: Bar[] = [];
    const p0 = pragueNow();
    for (let k = 11; k >= 0; k--) {
      let y = Number(p0.date.slice(0, 4));
      let m = Number(p0.date.slice(5, 7)) - k;
      while (m < 1) (m += 12, y--);
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const sum = monthly.filter((r) => dayKey(r.t).startsWith(key)).reduce((a, r) => a + r.a, 0) / 100;
      months.push({ label: `${m}/${String(y).slice(2)}`, value: Math.round(sum) });
    }
    return {
      classesCash: n(`SELECT COUNT(*) n FROM classes WHERE cash_enabled = 1 AND id IN ${REAL_C}`),
      requests: n(`SELECT COUNT(*) n FROM cash_requests WHERE class_id IN ${REAL_C}`),
      open: n(`SELECT COUNT(*) n FROM cash_requests WHERE closed_at IS NULL AND class_id IN ${REAL_C}`),
      paidCount: paid?.c ?? 0,
      paidTotal: (paid?.s ?? 0) / 100,
      unpaidCount: unpaid?.c ?? 0,
      unpaidTotal: (unpaid?.s ?? 0) / 100,
      claims: n(`SELECT COUNT(*) n FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.status = 'unpaid' AND p.claimed_at IS NOT NULL AND r.class_id IN ${REAL_C}`),
      methods: byMethod.map((r) => ({ label: label(r.m), count: r.c, amount: (r.s ?? 0) / 100 })),
      months,
      dutyClasses: n(`SELECT COUNT(*) n FROM classes WHERE duty_enabled = 1 AND id IN ${REAL_C}`),
      dutyWeeks: n(`SELECT COUNT(*) n FROM duty_weeks WHERE class_id IN ${REAL_C}`),
    };
  }, null);

  /* ---------- Systém ---------- */
  const system = safe(() => {
    const mem = process.memoryUsage();
    const tables = ["users", "sessions", "notes", "note_versions", "note_ydocs", "tasks", "tests", "messages", "cache", "stat_marks", "audit_log", "usage_daily", "usage_hourly", "rate_limits", "custom_events"];
    const bk = allBkStats();
    const sync = syncStat();
    return {
      uptimeMs: now - processStartedAt(),
      rss: mem.rss,
      heap: mem.heapUsed,
      node: process.version,
      db: fileSize("classmate.db"),
      wal: fileSize("classmate.db-wal"),
      diskFree: diskFree(),
      diskTotal: diskTotal(),
      migrations: n("SELECT COUNT(*) n FROM _migrations"),
      demos: activeDemos(),
      oauthClients: n("SELECT COUNT(*) n FROM oauth_clients"),
      audit: n("SELECT COUNT(*) n FROM audit_log"),
      inquiries: { total: n("SELECT COUNT(*) n FROM inquiries"), open: n("SELECT COUNT(*) n FROM inquiries WHERE handled_at IS NULL") },
      messages: { total: n(`SELECT COUNT(*) n FROM messages WHERE user_id IN ${REAL_U}`), read: n(`SELECT COUNT(*) n FROM messages WHERE read_at IS NOT NULL AND user_id IN ${REAL_U}`), emailed: n(`SELECT COUNT(*) n FROM messages WHERE emailed_at IS NOT NULL AND user_id IN ${REAL_U}`), pushed: n(`SELECT COUNT(*) n FROM messages WHERE pushed_at IS NOT NULL AND user_id IN ${REAL_U}`) },
      bakalari: { schools: bk.length, down: bk.filter(([, s]) => s.openUntil > now).length, ok: bk.reduce((a, [, s]) => a + s.ok, 0), fail: bk.reduce((a, [, s]) => a + s.fail, 0) },
      sync: { lastEnd: sync.lastEnd, durationMs: sync.durationMs, users: sync.users, failed: sync.failed },
      rowCounts: tables.map((t) => ({ label: t, value: n(`SELECT COUNT(*) n FROM ${t}`) })).sort((a, b) => b.value - a.value) as Bar[],
      auditActions: rows<{ label: string; value: number }>("SELECT action label, COUNT(*) value FROM audit_log GROUP BY action ORDER BY value DESC LIMIT 10") as Bar[],
    };
  }, null);

  return { generatedAt: now, people, growth, dau, usage, storage, content, devices, features, money, system };
}
