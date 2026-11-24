/**
 * Todoist: úkoly z Classmate se samy zapisují do Todoistu uživatele a změny z Todoistu se vracejí zpátky (oboustranně).
 * Z Todoistu se přebírá dokončení (a vrácení), změna názvu, popisu a termínu i smazání, ale jen to, co by smět udělat v aplikaci i sám uživatel.
 * Úkol zadaný někým jiným tak jde z Todoistu odškrtnout, ale ne přejmenovat, přesunout ani smazat: taková změna se nepřevezme,
 * v Todoistu se vrátí a uživateli přijde zpráva.
 * Přihlášení je OAuth (tlačítko Propojit), nebo osobní API token (Todoist → Nastavení → Integrace → Vývojáři); obojí se ukládá šifrovaně.
 * Komunikace jde jen na pevné adresy todoist.com a api.todoist.com přes Sync API (změny se berou přírůstkově podle sync_token).
 */
import { createHash, randomUUID } from "node:crypto";
import { all, get, run } from "./db";
import { decrypt, encrypt } from "./crypto";
import { listTasks, type TaskRow } from "./content";
import { notify } from "./messages";
import { siteUrl } from "./site";
import { USER_SELECT, type User } from "./session";

const API = "https://api.todoist.com/api/v1/sync";
export const DEFAULT_PROJECT = "Classmate";

export class TodoistError extends Error {}
/** Todoist odmítl token (401 nebo 403); trvalá chyba se ukáže až po několika neúspěších za sebou. */
export class TodoistAuthError extends TodoistError {
  constructor(public status: number) {
    super(`Todoist odmítl přístup (HTTP ${status}). Propoj ho znovu, nebo zkontroluj token.`);
  }
}
const authFails = new Map<number, number>();

type Account = { user_id: number; token_enc: string; project_id: string | null; project_name: string; last_sync_at: number | null; last_error: string | null; sync_token: string | null; auth: "token" | "oauth"; refresh_enc: string | null; expires_at: number | null };

export const todoistAccount = (userId: number) => get<Account>("SELECT * FROM todoist_accounts WHERE user_id = ?", userId);

type SyncResponse = {
  sync_status?: Record<string, "ok" | { error?: string; error_code?: number; http_code?: number }>;
  temp_id_mapping?: Record<string, string>;
  projects?: { id: string; name: string; is_deleted?: boolean; is_archived?: boolean }[];
  items?: RemoteItem[];
  sync_token?: string;
  full_sync?: boolean;
};
type RemoteItem = { id: string; content: string; description?: string; due?: { date?: string } | null; checked?: boolean; is_deleted?: boolean; project_id?: string };

/* ---------- přihlášení přes OAuth ---------- */

const OAUTH_AUTHORIZE = "https://todoist.com/oauth/authorize";
/** OAuth se nabízí, jen když správce serveru zaregistroval aplikaci v Todoistu (TODOIST_CLIENT_ID a TODOIST_CLIENT_SECRET v .env). */
export const todoistOAuthConfigured = () => !!process.env.TODOIST_CLIENT_ID?.trim() && !!process.env.TODOIST_CLIENT_SECRET?.trim();
export const todoistRedirectUri = () => `${siteUrl()}/nastaveni/todoist/callback`;

export function todoistAuthUrl(state: string) {
  return `${OAUTH_AUTHORIZE}?${new URLSearchParams({ client_id: process.env.TODOIST_CLIENT_ID!.trim(), scope: "data:read_write", state })}`;
}

/** Tokeny z OAuth: přístupový token vyprší (obvykle za hodinu), obnovuje se obnovovacím tokenem, který se při každém obnovení vymění za nový. */
export type TodoistTokens = { access: string; refresh?: string; expiresAt?: number };

async function tokenRequest(params: Record<string, string>): Promise<TodoistTokens> {
  let res: Response;
  try {
    res = await fetch("https://api.todoist.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "Classmate/1.0" },
      body: new URLSearchParams({ client_id: process.env.TODOIST_CLIENT_ID!.trim(), client_secret: process.env.TODOIST_CLIENT_SECRET!.trim(), ...params }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new TodoistError("Todoist teď není dostupný.");
  }
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
  if (!res.ok || !j?.access_token) {
    console.error("todoist token endpoint:", res.status, JSON.stringify(j)?.slice(0, 300));
    throw new TodoistError("Todoist přihlášení nepotvrdil. Zkus to znovu.");
  }
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined };
}

/** Vymění kód z přihlášení za tokeny. */
export async function todoistExchangeCode(code: string): Promise<TodoistTokens> {
  return tokenRequest({ code, redirect_uri: todoistRedirectUri() });
}

/** Obnoví přístupový token obnovovacím tokenem a uloží nové tokeny. Vrací nový přístupový token, nebo null, když obnovit nejde. */
async function refreshAccess(acc: Account): Promise<string | null> {
  if (acc.auth !== "oauth" || !acc.refresh_enc || !todoistOAuthConfigured()) return null;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(acc.refresh_enc) });
    run("UPDATE todoist_accounts SET token_enc = ?, refresh_enc = COALESCE(?, refresh_enc), expires_at = ? WHERE user_id = ?", encrypt(t.access), t.refresh ? encrypt(t.refresh) : null, t.expiresAt ?? null, acc.user_id);
    return t.access;
  } catch (e) {
    console.error("todoist obnovení tokenu selhalo", acc.user_id, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Jedno volání Sync API. Chyby převádí na srozumitelné české hlášky. */
async function sync(token: string, body: Record<string, string>, retried = false): Promise<SyncResponse> {
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "Classmate/1.0" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new TodoistError("Todoist teď není dostupný.");
  }
  if (res.status === 401 || res.status === 403) {
    // jednotlivé odmítnutí nemusí znamenat zrušený přístup (výpadek, ochrana proti botům), proto se zkusí ještě jednou a do logu jde, co Todoist odpověděl
    const text = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`todoist odmítl požadavek: HTTP ${res.status}`, text);
    if (!retried) {
      await new Promise((r) => setTimeout(r, 2000));
      return sync(token, body, true);
    }
    throw new TodoistAuthError(res.status);
  }
  if (res.status === 429) throw new TodoistError("Todoist teď omezuje počet požadavků, zkusí se to znovu později.");
  if (!res.ok) throw new TodoistError(`Todoist vrátil chybu ${res.status}.`);
  return (await res.json().catch(() => ({}))) as SyncResponse;
}

const cleanName = (v: string) => v.trim().slice(0, 120) || DEFAULT_PROJECT;

/** Najde projekt podle názvu, nebo ho založí. Vrací jeho id. */
async function ensureProject(token: string, name: string): Promise<string> {
  const r = await sync(token, { sync_token: "*", resource_types: JSON.stringify(["projects"]) });
  const found = (r.projects ?? []).find((p) => !p.is_deleted && !p.is_archived && p.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const uuid = randomUUID();
  const tmp = randomUUID();
  const c = await sync(token, { commands: JSON.stringify([{ type: "project_add", temp_id: tmp, uuid, args: { name } }]) });
  const st = c.sync_status?.[uuid];
  const id = c.temp_id_mapping?.[tmp];
  if (st !== "ok" || !id) throw new TodoistError("V Todoistu se nepodařilo založit projekt.");
  return id;
}

/** Připojení: ověří token (načtením projektů), založí projekt a uloží vše šifrovaně. `auth` říká, odkud token je (jen pro zobrazení v Nastavení). */
export async function connectTodoist(user: User, tokenRaw: string, projectName: string, auth: "token" | "oauth" = "token", extra?: { refresh?: string; expiresAt?: number }) {
  const token = tokenRaw.trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new TodoistError("Token vypadá špatně. Zkopíruj ho celý z Todoistu (Nastavení → Integrace → Vývojáři).");
  const name = cleanName(projectName);
  const projectId = await ensureProject(token, name);
  run("DELETE FROM todoist_links WHERE user_id = ?", user.id);
  run(
    `INSERT INTO todoist_accounts (user_id, token_enc, project_id, project_name, created_at, auth, refresh_enc, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET token_enc = excluded.token_enc, project_id = excluded.project_id, project_name = excluded.project_name, last_error = NULL, sync_token = NULL, auth = excluded.auth, refresh_enc = excluded.refresh_enc, expires_at = excluded.expires_at`,
    user.id, encrypt(token), projectId, name, Date.now(), auth, extra?.refresh ? encrypt(extra.refresh) : null, extra?.expiresAt ?? null,
  );
  await syncTodoist(user);
}

export function disconnectTodoist(userId: number) {
  run("DELETE FROM todoist_links WHERE user_id = ?", userId);
  run("DELETE FROM todoist_accounts WHERE user_id = ?", userId);
}

const hashOf = (parts: unknown[]) => createHash("sha1").update(JSON.stringify(parts)).digest("hex");

function contentOf(t: TaskRow) {
  return (t.subject_name ? `${t.subject_name}: ${t.title}` : t.title).slice(0, 500);
}
function descriptionOf(t: TaskRow) {
  return [t.note.trim(), `Zadáno v Classmate: ${siteUrl()}/ukoly`].filter(Boolean).join("\n\n").slice(0, 4000);
}

type Cmd = { type: string; uuid: string; temp_id?: string; args: Record<string, unknown> };
type Plan = { cmds: Cmd[]; /** uuid příkazu → co se má po úspěchu zapsat do vazby */ after: Map<string, { task: number; hash?: string; state?: number; drop?: boolean; tmp?: string }> };

/** Spočítá, co je potřeba v Todoistu udělat. Nic nevolá, jen porovnává stav v databázi. */
export function planTodoist(userId: number, classId: number, projectId: string): Plan {
  const open = listTasks(userId, classId, false);
  const done = listTasks(userId, classId, true);
  const links = new Map(all<{ task_id: number; todoist_id: string; hash: string; state: number }>("SELECT task_id, todoist_id, hash, state FROM todoist_links WHERE user_id = ?", userId).map((l) => [l.task_id, l]));
  const cmds: Cmd[] = [];
  const after: Plan["after"] = new Map();
  const add = (c: Omit<Cmd, "uuid">, a: Omit<NonNullable<ReturnType<Plan["after"]["get"]>>, never>) => {
    const uuid = randomUUID();
    cmds.push({ ...c, uuid });
    after.set(uuid, a);
  };
  const seen = new Set<number>();

  for (const t of open) {
    seen.add(t.id);
    const h = hashOf([contentOf(t), descriptionOf(t), t.due_date]);
    const l = links.get(t.id);
    const due = t.due_date ? { date: t.due_date } : null;
    if (!l) {
      const tmp = randomUUID();
      add({ type: "item_add", temp_id: tmp, args: { content: contentOf(t), description: descriptionOf(t), project_id: projectId, ...(due ? { due } : {}) } }, { task: t.id, hash: h, state: 0, tmp });
    } else if (l.state === 1) {
      // v Classmate ji uživatel zase otevřel: v Todoistu se vrátí mezi otevřené
      add({ type: "item_uncomplete", args: { id: l.todoist_id } }, { task: t.id, hash: l.hash, state: 0 });
    } else if (l.state === 0 && l.hash !== h) {
      add({ type: "item_update", args: { id: l.todoist_id, content: contentOf(t), description: descriptionOf(t), due } }, { task: t.id, hash: h, state: 0 });
    }
  }
  for (const t of done) {
    seen.add(t.id);
    const l = links.get(t.id);
    if (l && l.state === 0) add({ type: "item_close", args: { id: l.todoist_id } }, { task: t.id, hash: l.hash, state: 1 });
  }
  // úkol zmizel (smazán, nebo ho uživatel už nevidí): otevřenou položku z Todoistu odstraníme
  for (const l of links.values()) {
    if (seen.has(l.task_id)) continue;
    if (l.state === 0) add({ type: "item_delete", args: { id: l.todoist_id } }, { task: l.task_id, drop: true });
    else run("DELETE FROM todoist_links WHERE user_id = ? AND task_id = ?", userId, l.task_id);
  }
  return { cmds, after };
}

/** Provede plán a zapíše výsledky. Příkazy jdou po dávkách, ať se nepřekročí limit. */
export async function applyPlan(userId: number, token: string, plan: Plan) {
  for (let i = 0; i < plan.cmds.length; i += 50) {
    const chunk = plan.cmds.slice(i, i + 50);
    const r = await sync(token, { commands: JSON.stringify(chunk) });
    for (const c of chunk) {
      const a = plan.after.get(c.uuid)!;
      const st = r.sync_status?.[c.uuid];
      if (st === "ok") {
        if (a.drop) run("DELETE FROM todoist_links WHERE user_id = ? AND task_id = ?", userId, a.task);
        else if (a.tmp) {
          const id = r.temp_id_mapping?.[a.tmp];
          if (id) run("INSERT OR REPLACE INTO todoist_links (user_id, task_id, todoist_id, hash, state) VALUES (?, ?, ?, ?, ?)", userId, a.task, id, a.hash!, a.state ?? 0);
        } else run("UPDATE todoist_links SET hash = ?, state = ? WHERE user_id = ? AND task_id = ?", a.hash!, a.state ?? 0, userId, a.task);
      } else if (st && typeof st === "object") {
        // položka v Todoistu už neexistuje (smazal ji uživatel): vazbu držíme jako „pryč“, ať se úkol nezakládá pořád dokola
        if (st.http_code === 404 || /not.?found/i.test(String(st.error))) {
          if (a.drop) run("DELETE FROM todoist_links WHERE user_id = ? AND task_id = ?", userId, a.task);
          else run("UPDATE todoist_links SET state = 2 WHERE user_id = ? AND task_id = ?", userId, a.task);
        }
      }
    }
  }
}

/* ---------- změny z Todoistu zpátky do Classmate ---------- */

const FOOTER = /\n*Zadáno v Classmate: \S+\s*$/;
const dueFrom = (d?: { date?: string } | null) => d?.date?.slice(0, 10) || undefined;
type LinkRow = { task_id: number; todoist_id: string; hash: string; state: number };

/**
 * Načte změny v Todoistu od minula a přenese je do Classmate, jen když by je smět udělat i sám uživatel v aplikaci.
 * Nepovolená změna se nepřevezme: položka v Todoistu se vrátí do stavu z Classmate (hash = "" vynutí její přepsání) a uživateli přijde zpráva.
 * Když se úkol změnil na obou stranách, vyhrává Classmate.
 */
async function pullTodoist(user: User, acc: Account, token: string, projectId: string) {
  const svc = await import("./services");
  const r = await sync(token, { sync_token: acc.sync_token ?? "*", resource_types: JSON.stringify(["items"]) });
  const links = new Map(all<LinkRow>("SELECT task_id, todoist_id, hash, state FROM todoist_links WHERE user_id = ?", user.id).map((l) => [l.todoist_id, l]));
  const visible = new Map([...listTasks(user.id, user.class_id, false), ...listTasks(user.id, user.class_id, true)].map((t) => [t.id, t]));
  const setLink = (taskId: number, set: string, ...v: (string | number)[]) => run(`UPDATE todoist_links SET ${set} WHERE user_id = ? AND task_id = ?`, ...v, user.id, taskId);
  const deny = (t: TaskRow, what: string, why: string, key: string) =>
    notify(user.id, { category: "system", title: "Změna z Todoistu se nepřenesla", body: `${what} „${t.title}“: ${why} V Todoistu jsem ho vrátil do původního stavu.`, link: "/ukoly", key });
  const reason = (e: unknown) => (e instanceof svc.ServiceError ? e.message : null);
  const gone: { l: LinkRow; t: TaskRow }[] = [];

  for (const it of r.items ?? []) {
    const l = links.get(it.id);
    const t = l && visible.get(l.task_id);
    if (!l || !t || l.state === 2) continue;
    if (it.is_deleted) {
      gone.push({ l, t });
      continue;
    }
    if (it.project_id && it.project_id !== projectId) {
      setLink(t.id, "state = 2"); // uživatel položku přesunul jinam, dál ji nesledujeme
      continue;
    }
    const remoteDone = !!it.checked;
    if (remoteDone && l.state === 0) {
      svc.setTaskDone(user, t.id, true);
      setLink(t.id, "state = 1");
      continue;
    }
    if (!remoteDone && l.state === 1) {
      svc.setTaskDone(user, t.id, false);
      setLink(t.id, "state = 0");
      l.state = 0;
    }
    if (l.state !== 0 || remoteDone) continue;

    const remoteHash = hashOf([it.content, it.description ?? "", dueFrom(it.due) ?? null]);
    const localHash = hashOf([contentOf(t), descriptionOf(t), t.due_date]);
    if (remoteHash === l.hash || localHash !== l.hash) continue; // v Todoistu se nic nezměnilo, nebo se mezitím změnil úkol v Classmate
    const prefix = t.subject_name ? `${t.subject_name}: ` : "";
    const title = (prefix && it.content.startsWith(prefix) ? it.content.slice(prefix.length) : it.content).trim();
    const note = (it.description ?? "").replace(FOOTER, "").trim();
    const due = dueFrom(it.due);
    if (title === t.title && note === t.note.trim() && (due ?? null) === t.due_date) {
      setLink(t.id, "hash = ?", localHash); // jen jiný zápis téhož (mezery, formát data)
      continue;
    }
    try {
      svc.updateTask(user, t.id, { title, due, note });
    } catch (e) {
      const why = reason(e);
      if (!why) throw e;
      deny(t, "Změna úkolu", why, `todoist-deny:${t.id}:${remoteHash.slice(0, 10)}`);
    }
    setLink(t.id, "hash = ''"); // do Todoistu se zapíše výsledná (nebo původní) podoba
  }

  if (gone.length > 3) {
    // třeba smazaný celý projekt: nic nemažeme, jen přestaneme položky sledovat
    for (const { t } of gone) setLink(t.id, "state = 2");
    notify(user.id, { category: "system", title: "V Todoistu zmizelo víc úkolů najednou", body: "Smazání jsem nepřevzal, úkoly v Classmate zůstaly. Tyhle položky už se v Todoistu nesledují.", link: "/nastaveni?k=propojeni#todoist", key: `todoist-mass:${Math.floor(Date.now() / 3_600_000)}` });
  } else {
    for (const { t } of gone) {
      try {
        svc.deleteTask(user, t.id);
      } catch (e) {
        const why = reason(e);
        if (!why) throw e;
        deny(t, "Smazání úkolu", why, `todoist-deny:${t.id}:del:${Math.floor(Date.now() / 60_000)}`);
      }
      run("DELETE FROM todoist_links WHERE user_id = ? AND task_id = ?", user.id, t.id); // když úkol zůstal, založí se v Todoistu znovu
    }
  }
  if (r.sync_token) run("UPDATE todoist_accounts SET sync_token = ? WHERE user_id = ?", r.sync_token, user.id);
}

const running = new Set<number>();

/** Srovná Todoist s úkoly uživatele. Chyby se ukládají k účtu (zobrazí se v Nastavení) a nikdy nevyletí ven. */
export async function syncTodoist(user: Pick<User, "id" | "class_id">, retried = false): Promise<void> {
  const acc = todoistAccount(user.id);
  if (!acc || running.has(user.id)) return;
  running.add(user.id);
  try {
    let token = decrypt(acc.token_enc);
    // přístupový token z OAuth vyprší: obnoví se předem (2 minuty před koncem) a pro jistotu i po odmítnutí níže
    if (acc.expires_at && acc.expires_at - 120_000 < Date.now()) token = (await refreshAccess(acc)) ?? token;
    let projectId = acc.project_id;
    if (!projectId) {
      projectId = await ensureProject(token, acc.project_name);
      run("UPDATE todoist_accounts SET project_id = ? WHERE user_id = ?", projectId, user.id);
    }
    const full = get<User>(`${USER_SELECT} WHERE u.id = ?`, user.id);
    if (!full) return;
    await pullTodoist(full, acc, token, projectId);
    const plan = planTodoist(user.id, user.class_id, projectId);
    if (plan.cmds.length) await applyPlan(user.id, token, plan);
    authFails.delete(user.id);
    run("UPDATE todoist_accounts SET last_sync_at = ?, last_error = NULL WHERE user_id = ?", Date.now(), user.id);
  } catch (e) {
    if (e instanceof TodoistAuthError && !retried && (await refreshAccess(acc))) {
      running.delete(user.id);
      return syncTodoist(user, true); // token se obnovil, zkusí se to znovu s novým
    }
    if (e instanceof TodoistAuthError) {
      const n = (authFails.get(user.id) ?? 0) + 1;
      authFails.set(user.id, n);
      if (n < 3) return; // zatím jen zaznamenáno, chyba se uživateli neukazuje; další běh to zkusí znovu
    }
    const msg = e instanceof TodoistError ? e.message : "Synchronizace s Todoistem selhala.";
    if (!(e instanceof TodoistError)) console.error("todoist sync failed", user.id, e);
    run("UPDATE todoist_accounts SET last_error = ? WHERE user_id = ?", msg, user.id);
  } finally {
    running.delete(user.id);
  }
}

const timers = new Map<number, NodeJS.Timeout>();

/** Po změně úkolu: za chvíli (sloučí se víc změn za sebou) srovná Todoist uživatele, který změnu udělal. Ostatní dožene pravidelný běh. */
export function todoistSoon(user: Pick<User, "id" | "class_id">) {
  if (!todoistAccount(user.id)) return;
  clearTimeout(timers.get(user.id));
  timers.set(
    user.id,
    setTimeout(() => {
      timers.delete(user.id);
      void syncTodoist(user);
    }, 2500).unref?.() as unknown as NodeJS.Timeout,
  );
}

/** Pravidelný běh (každé 2 minuty) pro všechny připojené uživatele: spolužáci dostanou i úkoly, které zadal někdo jiný, a změny z Todoistu se vrátí do Classmate. */
export async function todoistTick() {
  const rows = all<{ id: number; class_id: number }>("SELECT u.id, u.class_id FROM todoist_accounts a JOIN users u ON u.id = a.user_id");
  for (const u of rows) {
    await syncTodoist(u);
    await new Promise((r) => setTimeout(r, 500));
  }
}
