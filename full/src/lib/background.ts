/**
 * Pravidelná synchronizace na pozadí, aby zprávy (suplování, nové známky…) přišly, i když aplikace není otevřená.
 * Běží v jednom procesu serveru. Interval nastavíš v BACKGROUND_SYNC_MINUTES (výchozí 5, 0 = vypnuto).
 * Synchronizují se jen uživatelé s propojenými Bakaláři, kteří byli v posledních 14 dnech aktivní.
 */
import { all, db } from "./db";
import { syncStat } from "./metrics";
import { emailTick } from "./email-notify";
import { pushTick } from "./push";
import { announceTick } from "./announce";
import { purgeExpiredTrash } from "./note-safety";
import { ensureAllSchedules } from "./duty";
import { purgeHousekeeping } from "./expire";
import { purgeStudy } from "./study";
import { achievementsSweep } from "./achievements";
import { purgeExpiredDemos } from "./demo-visitor";
import { USER_SELECT, type User } from "./session";
import { getAbsence, getMarks, getTimetable } from "./sync";
import { getKomens } from "./komens";
import { todoistTick } from "./todoist";

const g = globalThis as unknown as { __classmateBg?: boolean; __classmateSyncRunning?: boolean };

/** Kolik škol se synchronizuje naráz (BACKGROUND_SYNC_PARALLEL, výchozí 8). Uvnitř jedné školy jdou uživatelé po jednom. */
const parallel = () => {
  const n = Number(process.env.BACKGROUND_SYNC_PARALLEL);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 8;
};

async function syncUser(user: User) {
  try {
    await Promise.all([getTimetable(user, "this", true), getTimetable(user, "next", true), getMarks(user, true), getAbsence(user, true), getKomens(user, "received", true).catch(() => null), getKomens(user, "noticeboard", true).catch(() => null)]);
    return true;
  } catch (e) {
    console.error("background sync failed for user", user.id, e);
    return false;
  }
}

/**
 * Jeden průchod. Uživatelé se rozdělí podle školy (každá škola má vlastní server Bakalářů): školy jdou souběžně, uvnitř školy
 * se uživatelé střídají s malou pauzou. Kdo se právě synchronizoval (otevřel aplikaci), se přeskočí, ať se zbytečně nevolají Bakaláři.
 * Při velkém počtu uživatelů se tak průchod zkrátí z hodin na minuty a nikdo nezahltí server jedné školy.
 */
async function runOnce(intervalMs: number, force = false) {
  const st = syncStat();
  st.lastStart = Date.now();
  const since = Date.now() - 14 * 86_400_000;
  const users = all<User & { last_sync_at: number | null }>(
    `${USER_SELECT} WHERE u.bakalari_refresh_enc IS NOT NULL AND u.demo = 0`  +
      ` AND (u.id IN (SELECT user_id FROM sessions WHERE last_seen > ${since}) OR u.id IN (SELECT user_id FROM oauth_tokens WHERE COALESCE(last_used_at, created_at) > ${since}) OR u.id IN (SELECT user_id FROM app_devices WHERE COALESCE(last_seen_at, created_at) > ${since}))`,
  );
  const fresh = force ? -1 : Date.now() - intervalMs * 0.6; // při ručním spuštění se nepřeskakuje nikdo
  const bySchool = new Map<string, User[]>();
  let skipped = 0;
  let failed = 0;
  let done = 0;
  for (const u of users) {
    if (u.last_sync_at && u.last_sync_at > fresh) {
      skipped++;
      continue;
    }
    const key = u.bakalari_url ?? `school-${u.school_id}`;
    bySchool.set(key, [...(bySchool.get(key) ?? []), u]);
  }
  const queue = [...bySchool.values()].sort((a, b) => b.length - a.length); // největší školy první, ať neběží na konci osamoceně
  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const user of group) {
        if (await syncUser(user)) done++;
        else failed++;
        await new Promise((r) => setTimeout(r, 700)); // ať Bakaláře školy nezahltíme
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel(), queue.length) }, worker));
  Object.assign(st, { lastEnd: Date.now(), users: done, skipped, failed, schools: bySchool.size, durationMs: Date.now() - (st.lastStart ?? Date.now()) });
  if (users.length > 50) console.log(`Synchronizace na pozadí: ${done} uživatelů z ${bySchool.size} škol za ${Math.round(st.durationMs / 1000)} s (přeskočeno ${skipped}, chyb ${failed})`);
}

/** Jeden průchod s hlídáním, aby neběžely dva naráz (automatický a ruční). Vrací false, když už jeden běží. */
async function guarded(intervalMs: number, force: boolean) {
  if (g.__classmateSyncRunning) return false;
  g.__classmateSyncRunning = true;
  try {
    await runOnce(intervalMs, force);
  } catch (e) {
    console.error("background sync error", e);
  } finally {
    g.__classmateSyncRunning = false;
  }
  return true;
}

export const syncRunning = () => !!g.__classmateSyncRunning;

/** Ruční spuštění ze Správy: synchronizuje všechny aktivní uživatele hned, bez ohledu na to, kdy byli naposledy. Běží na pozadí. */
export function syncNow(): "started" | "running" {
  if (g.__classmateSyncRunning) return "running";
  void guarded(0, true);
  return "started";
}

export function startBackgroundSync() {
  if (g.__classmateBg) return;
  const minutes = Number(process.env.BACKGROUND_SYNC_MINUTES ?? 5);
  if (!(minutes > 0)) return;
  g.__classmateBg = true;
  const tick = () => void guarded(minutes * 60_000, false);
  setTimeout(tick, 60_000); // první běh minutu po startu
  setInterval(tick, minutes * 60_000).unref?.();
}

/** Odesílání e-mailových upozornění (jednou za minutu), nezávislé na synchronizaci s Bakaláři. */
export function startEmailWorker() {
  const g2 = globalThis as unknown as { __classmateMail?: boolean };
  if (g2.__classmateMail) return;
  g2.__classmateMail = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await emailTick();
      await announceTick();
      await pushTick();
    } catch (e) {
      console.error("email worker error", e);
    } finally {
      running = false;
    }
  }, 60_000).unref?.();
}

/** Úklid koše poznámek: po 30 dnech se smažou natrvalo (i s nahrávkami a obrázky). Běží při startu a pak každých 6 hodin. */
export function startTrashCleanup() {
  const g3 = globalThis as unknown as { __classmateTrash?: boolean };
  if (g3.__classmateTrash) return;
  g3.__classmateTrash = true;
  const run = () => {
    try {
      const n = purgeExpiredTrash();
      if (n) console.log(`Koš poznámek: trvale smazáno ${n}`);
      ensureAllSchedules();
      purgeHousekeeping();
      db().pragma("optimize"); // statistiky pro plánovač dotazů, ať zůstanou rychlé i s tisíci uživatelů
      db().pragma("wal_checkpoint(TRUNCATE)"); // soubor s deníkem zápisů se vrátí na nulu, ať nenarůstá (a je rychlejší záloha)
      const ach = achievementsSweep();
      if (ach) console.log(`Trofeje: nově odemčeno ${ach}`);
      const m = purgeStudy();
      if (m) console.log(`Studijní sady: smazáno ${m}`);
      const d = purgeExpiredDemos();
      if (d) console.log(`Demo: smazáno ${d} vypršených ukázkových tříd`);
    } catch (e) {
      console.error("trash cleanup error", e);
    }
  };
  try {
    purgeStudy(true); // po restartu žádné rozjeté generování neběží
    purgeExpiredDemos();
    purgeHousekeeping();
  } catch (e) {
    console.error("study cleanup error", e);
  }
  setTimeout(run, 120_000).unref?.();
  setInterval(run, 1800_000).unref?.();
}

/** Todoist: úkoly zadané někým jiným se k připojeným uživatelům dostanou do pár minut a změny z Todoistu se vrátí do Classmate. */
export function startTodoistWorker() {
  const g3 = globalThis as unknown as { __classmateTodoist?: boolean };
  if (g3.__classmateTodoist) return;
  g3.__classmateTodoist = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await todoistTick();
    } catch (e) {
      console.error("todoist worker error", e);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 90_000);
  setInterval(tick, 2 * 60_000).unref?.();
}
