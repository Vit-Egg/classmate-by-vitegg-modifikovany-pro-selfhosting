/**
 * Pochvaly: sběr čísel o uživateli, vyhodnocení a ukládání odemčených. Texty a podmínky jsou v achievements-defs.ts.
 * Počítá se jen z toho, co už server má (databáze a paměť s daty z Bakalářů), nic se nestahuje. Odemčené zůstávají navždy.
 * Žádné zprávy ani upozornění: pochvaly jsou doplněk a nesmí se plést mezi důležité věci (známky, rozvrh, absence). Nové se jen označí na stránce.
 */
import { all, get, run } from "./db";
import { ACHIEVEMENTS, points, LEVELS, MAX_POINTS, type Achievement, type Meter, type Stats } from "./achievements-defs";
import { addDays, diffDays, dowOf, pragueNow, TZ } from "./dates";
import { weightedAverage } from "./normalize";
import { parseSocials } from "./socials";
import { peekAbsence, peekMarks } from "./sync";
import { USER_SELECT, type User } from "./session";

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback; // chybějící tabulka nebo neplatná data nesmí shodit stránku
  }
};
const count = (sql: string, ...p: unknown[]) => safe(() => get<{ n: number | null }>(sql, ...p)?.n ?? 0, 0);

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function prague(ms: number) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(ms)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Nejdelší řada po sobě jdoucích dnů (seřazené ISO data, bez duplicit); `next` říká, který den navazuje. */
function longestRun(days: string[], next: (d: string) => string): number {
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of days) {
    run = prev && next(prev) === d ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return best;
}
const nextSchoolDay = (d: string) => {
  let n = addDays(d, 1);
  while (dowOf(n) >= 6) n = addDays(n, 1);
  return n;
};

function markStats(user: User) {
  const out = { marks: 0, ones: 0, fives: 0, avg: null as number | null, run1: 0, run5: 0, perfectSubjects: 0, goodSubjects: 0, comebacks: 0, onesInDay: 0, percent100: 0 };
  const data = safe(() => peekMarks(user), null);
  if (!data) return out;
  const all_: { subject: string; value: number; date: string; id: string; weight: number }[] = [];
  for (const s of data.subjects) {
    const own = s.marks.filter((m) => m.value != null).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    for (const m of own) all_.push({ subject: s.id, value: m.value!, date: m.date, id: m.id, weight: m.weight || 1 });
    out.percent100 += s.marks.filter((m) => m.percent != null && m.percent >= 100).length;
    if (own.length >= 3) {
      if (own.every((m) => m.value === 1)) out.perfectSubjects++;
      const a = weightedAverage(own.map((m) => ({ value: m.value, weight: m.weight || 1 })));
      if (a != null && a <= 1.5 + 1e-9) out.goodSubjects++;
    }
    for (let i = 1; i < own.length; i++) if (own[i].value === 1 && own[i - 1].value! >= 4) out.comebacks++;
  }
  all_.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  out.marks = all_.length;
  out.ones = all_.filter((m) => m.value === 1).length;
  out.fives = all_.filter((m) => m.value >= 5).length;
  out.avg = weightedAverage(all_);
  let r1 = 0;
  let r5 = 0;
  const perDay = new Map<string, number>();
  for (const m of all_) {
    r1 = m.value === 1 ? r1 + 1 : 0;
    r5 = m.value >= 5 ? r5 + 1 : 0;
    out.run1 = Math.max(out.run1, r1);
    out.run5 = Math.max(out.run5, r5);
    if (m.value === 1) perDay.set(m.date, (perDay.get(m.date) ?? 0) + 1);
  }
  out.onesInDay = Math.max(0, ...perDay.values());
  return out;
}

function absenceStats(user: User, today: string) {
  const out = { absLoaded: false, absPct: 0, absMaxSubjectPct: 0, absRun: 0, unexcused: 0, late: 0, soon: 0, absHours: 0, cleanDays: 0 };
  const data = safe(() => peekAbsence(user), null);
  if (!data) return out;
  out.absLoaded = true;
  const lessons = data.subjects.reduce((n, s) => n + s.lessons, 0);
  const missed = data.subjects.reduce((n, s) => n + s.missed, 0);
  out.absPct = lessons > 0 ? (missed / lessons) * 100 : 0;
  out.absMaxSubjectPct = Math.max(0, ...data.subjects.filter((s) => s.lessons >= 8).map((s) => (s.missed / s.lessons) * 100));
  const absent: string[] = [];
  for (const d of data.days) {
    const h = d.missed + d.excused + d.unsolved;
    out.absHours += h;
    out.unexcused += d.missed;
    out.late += d.late;
    out.soon += d.soon;
    if (h > 0) absent.push(d.date);
  }
  absent.sort();
  // řada nepřítomných školních dnů (víkend ji nepřeruší); délka se bere v kalendářních dnech od prvního do posledního dne řady
  let start = "";
  let prev = "";
  for (const d of absent) {
    if (!(prev && nextSchoolDay(prev) === d)) start = d;
    prev = d;
    out.absRun = Math.max(out.absRun, diffDays(start, d) + 1);
  }
  const y = Number(today.slice(0, 4));
  const yearStart = `${Number(today.slice(5, 7)) >= 9 ? y : y - 1}-09-01`;
  const last = absent.length ? absent[absent.length - 1] : "";
  const since = last > yearStart ? last : yearStart;
  out.cleanDays = Math.max(0, diffDays(since, today));
  return out;
}

export function collectStats(user: User): Stats {
  const id = user.id;
  const today = pragueNow().date;
  const row = safe(() => get<{ created_at: number; totp_enabled: number; bakalari_refresh_enc: string | null; email_notify: string; share_marks_stats: number | null; socials: string | null }>("SELECT created_at, totp_enabled, bakalari_refresh_enc, email_notify, share_marks_stats, socials FROM users WHERE id = ?", id), undefined);

  // poznámky: čas vzniku pro noční a ranní zápisy
  const noteTimes = safe(() => all<{ created_at: number }>("SELECT created_at FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 4000", id), []);
  let nightNotes = 0;
  let earlyNotes = 0;
  for (const n of noteTimes) {
    const h = prague(n.created_at).hour;
    if (h < 4) nightNotes++;
    else if (h >= 5 && h < 7) earlyNotes++;
  }

  // splněné úkoly: dny, předčasnost, noční a nedělní
  const done = safe(() => all<{ done_at: number; due_date: string | null }>("SELECT d.done_at, t.due_date FROM task_done d JOIN tasks t ON t.id = d.task_id WHERE d.user_id = ? ORDER BY d.done_at DESC LIMIT 5000", id), []);
  const perDay = new Map<string, number>();
  let tasksEarly = 0;
  let taskNight = 0;
  let taskEarly = 0;
  let taskSunday = 0;
  let taskLastMinute = 0;
  for (const d of done) {
    const p = prague(d.done_at);
    perDay.set(p.date, (perDay.get(p.date) ?? 0) + 1);
    if (d.due_date && p.date < d.due_date) tasksEarly++;
    if (p.hour < 4) taskNight++;
    else if (p.hour >= 5 && p.hour < 7) taskEarly++;
    if (dowOf(p.date) === 7 && p.hour >= 18) taskSunday++;
    if (d.due_date && p.date === d.due_date && p.hour >= 22) taskLastMinute++;
  }
  const taskDays = [...perDay.keys()].sort();

  const usage = safe(() => all<{ day: string }>("SELECT day FROM usage_daily WHERE user_id = ? ORDER BY day", id).map((r) => r.day), []);

  const m = markStats(user);
  const a = absenceStats(user, today);
  return {
    ...m,
    ...a,
    notes: count("SELECT COUNT(*) n FROM notes WHERE user_id = ? AND deleted_at IS NULL", id),
    sharedNotes: count("SELECT COUNT(*) n FROM notes WHERE user_id = ? AND deleted_at IS NULL AND shared = 1", id),
    words: count("SELECT SUM(length(trim(text)) - length(replace(trim(text), ' ', '')) + 1) n FROM notes WHERE user_id = ? AND deleted_at IS NULL AND trim(text) != ''", id),
    noteImages: count("SELECT COUNT(*) n FROM note_images WHERE user_id = ?", id),
    noteAudio: count("SELECT COUNT(*) n FROM note_audio WHERE user_id = ?", id),
    noteFiles: count("SELECT COUNT(*) n FROM note_files WHERE user_id = ?", id),
    boards: count("SELECT COUNT(*) n FROM notes WHERE user_id = ? AND deleted_at IS NULL AND board NOT IN ('', '[]', '{}', 'null')", id),
    votesGot: count("SELECT COUNT(*) n FROM note_votes v JOIN notes n ON n.id = v.note_id WHERE n.user_id = ? AND v.user_id != ?", id, id),
    fiveStarsGot: count("SELECT COUNT(*) n FROM note_votes v JOIN notes n ON n.id = v.note_id WHERE n.user_id = ? AND v.user_id != ? AND v.stars >= 5", id, id),
    comments: count("SELECT COUNT(*) n FROM note_comments WHERE user_id = ?", id),
    pinnedNotes: count("SELECT COUNT(*) n FROM notes WHERE user_id = ? AND deleted_at IS NULL AND pinned = 1", id),
    nightNotes,
    earlyNotes,
    bigNote: count("SELECT COUNT(*) n FROM notes WHERE user_id = ? AND deleted_at IS NULL AND length(text) - length(replace(text, ' ', '')) >= 3000", id),
    tasksDone: done.length,
    tasksCreated: count("SELECT COUNT(*) n FROM tasks WHERE created_by = ?", id),
    tasksEarly,
    tasksDayMax: Math.max(0, ...perDay.values()),
    taskStreak: longestRun(taskDays, (d) => addDays(d, 1)),
    taskNight,
    taskEarly,
    taskSunday,
    taskLastMinute,
    testsCreated: count("SELECT COUNT(*) n FROM tests WHERE created_by = ?", id),
    studied: count("SELECT COUNT(*) n FROM study_progress WHERE user_id = ? AND (known != '[]' OR COALESCE(quiz_total, 0) > 0)", id),
    quizzes: count("SELECT COUNT(*) n FROM study_progress WHERE user_id = ? AND COALESCE(quiz_total, 0) > 0", id),
    quizPerfect: count("SELECT COUNT(*) n FROM study_progress WHERE user_id = ? AND COALESCE(quiz_total, 0) > 0 AND COALESCE(quiz_best, 0) >= quiz_total", id),
    cardsKnown: count("SELECT SUM(json_array_length(known)) n FROM study_progress WHERE user_id = ?", id),
    summaries: count("SELECT COUNT(*) n FROM subject_summaries WHERE user_id = ?", id),
    activeDays: usage.length,
    activeStreak: longestRun(usage, (d) => addDays(d, 1)),
    ageDays: row ? Math.max(0, Math.floor((Date.now() - row.created_at) / 86_400_000)) : 0,
    totp: row?.totp_enabled ? 1 : 0,
    avatar: count("SELECT COUNT(*) n FROM avatars WHERE user_id = ?", id) ? 1 : 0,
    contacts: Object.keys(parseSocials(row?.socials)).length,
    bakalari: row?.bakalari_refresh_enc ? 1 : 0,
    mailOn: row && row.email_notify !== "off" ? 1 : 0,
    push: count("SELECT (SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?) + (SELECT COUNT(*) FROM app_devices WHERE user_id = ? AND fcm_token IS NOT NULL) n", id, id) ? 1 : 0,
    calFeed: count("SELECT COUNT(*) n FROM calendar_feeds WHERE user_id = ?", id) ? 1 : 0,
    todoist: count("SELECT COUNT(*) n FROM todoist_accounts WHERE user_id = ?", id) ? 1 : 0,
    strava: count("SELECT COUNT(*) n FROM strava_accounts WHERE user_id = ?", id) ? 1 : 0,
    shareStats: row?.share_marks_stats === 1 ? 1 : 0,
    appDevice: count("SELECT COUNT(*) n FROM app_devices WHERE user_id = ?", id) ? 1 : 0,
    msgRead: count("SELECT COUNT(*) n FROM messages WHERE user_id = ? AND read_at IS NOT NULL", id),
    cashPaid: count("SELECT COUNT(*) n FROM cash_payments WHERE user_id = ? AND status = 'paid' AND exempt = 0", id),
    cashFast: count("SELECT COUNT(*) n FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.user_id = ? AND p.status = 'paid' AND p.exempt = 0 AND p.paid_at IS NOT NULL AND p.paid_at - r.created_at <= 86400000", id),
    duty: count("SELECT COUNT(*) n FROM duty_weeks WHERE user_id = ? AND week_start <= ?", id, today),
    trainings: count("SELECT COUNT(*) n FROM training_entries WHERE user_id = ?", id),
    trainMinutes: count("SELECT SUM(minutes) n FROM training_entries WHERE user_id = ?", id),
    events: count("SELECT COUNT(*) n FROM custom_events WHERE user_id = ?", id),
    unlocked: 0,
  };
}

export type Item = { a: Achievement; meter: Meter; unlockedAt: number | null };

const INIT = "_init";

/**
 * Vyhodnotí všechny pochvaly uživatele a uloží nově odemčené.
 * Vrací seznam všech pochval s ukazateli a počet nově získaných.
 */
export function evaluate(user: User): { items: Item[]; fresh: Achievement[] } {
  const rows = all<{ key: string; unlocked_at: number }>("SELECT key, unlocked_at FROM achievements WHERE user_id = ?", user.id);
  const have = new Map(rows.map((r) => [r.key, r.unlocked_at]));
  const first = !have.has(INIT);
  const stats = collectStats(user);
  const now = Date.now();
  const fresh: Achievement[] = [];
  const unlock = (a: Achievement) => {
    have.set(a.id, now);
    fresh.push(a);
  };
  for (const meta of [false, true]) {
    stats.unlocked = [...have.keys()].filter((k) => k !== INIT).length;
    for (const a of ACHIEVEMENTS) {
      if (!!a.meta !== meta || have.has(a.id)) continue;
      const m = a.meter(stats);
      if (m.cur >= m.goal) unlock(a);
    }
  }
  if (first) run("INSERT OR IGNORE INTO achievements (user_id, key, unlocked_at) VALUES (?, ?, ?)", user.id, INIT, now);
  for (const a of fresh) run("INSERT OR IGNORE INTO achievements (user_id, key, unlocked_at) VALUES (?, ?, ?)", user.id, a.id, now);
  stats.unlocked = [...have.keys()].filter((k) => k !== INIT).length;
  const items = ACHIEVEMENTS.map((a) => ({ a, meter: a.meter(stats), unlockedAt: have.get(a.id) ?? null }));
  return { items, fresh };
}

export function levelOf(pts: number) {
  let i = 0;
  LEVELS.forEach((l, idx) => {
    if (pts >= l.from) i = idx;
  });
  const next = LEVELS[i + 1] ?? null;
  return { index: i, name: LEVELS[i].name, line: LEVELS[i].line, from: LEVELS[i].from, next: next ? { name: next.name, from: next.from } : null };
}

export const earnedPoints = (items: Item[]) => items.filter((i) => i.unlockedAt).reduce((n, i) => n + points(i.a), 0);
export { MAX_POINTS };

/** Pravidelný průchod: kdo byl v posledních dvou dnech aktivní, dostane případné nové pochvaly (a zprávu o nich), i když stránku neotevřel. */
export function achievementsSweep(): number {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const users = all<User>(`${USER_SELECT} WHERE u.placeholder = 0 AND u.demo = 0 AND u.id IN (SELECT user_id FROM usage_daily WHERE day >= ?)`, since);
  let n = 0;
  for (const u of users) {
    try {
      n += evaluate(u).fresh.length;
    } catch (e) {
      console.error("achievements sweep failed for user", u.id, e);
    }
  }
  return n;
}
