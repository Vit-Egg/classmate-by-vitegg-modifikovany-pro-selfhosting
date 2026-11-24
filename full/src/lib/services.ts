/**
 * Doménová logika, kterou sdílí webové rozhraní (server actions) i MCP server.
 * Vše, co smí udělat uživatel v aplikaci, má jedinou implementaci tady – AI klient tak dělá přesně totéž, nic víc, nic míň.
 */
import { audit } from "./audit";
import { todoistSoon } from "./todoist";
import { createAnnouncement, cancelAnnouncement, type Audience } from "./announce";
import { mailConfigured } from "./mail";
import { RosterError, memberNamed, nameKey, rosterAdd, rosterOf, rosterRemove, saveRoster } from "./roster";
import { z } from "zod";
import { DEFAULT_BOARD_NAME, MAX_BOARDS, serializeBoards } from "./boards";
import { purgeNoteNow, restoreVersion as restoreVersionRaw, snapshot } from "./note-safety";
import { SHORTCUTS, resolveKeys, validateKeys, type KeyMap } from "./shortcuts";
import { cleanDoc, cloneImages, pruneImages } from "./images";
import { hashPassword } from "./crypto";
import { passwordProblem } from "./password-policy";
import { DEFAULT_MODELS, getAiConfig, keyId, saveAiConfig, type AiKey } from "./ai-config";
import { get, run, all, tx, rateLimit } from "./db";
import { addDays, dayName, dowOf, renderNoteTitle, schoolYearEnd } from "./dates";
import { normalizeBaseUrl, BakalariError, internalHost } from "./bakalari";
import { peekTimetable, subjectGroups, userSubjects } from "./sync";
import { taskOwner, testOwner } from "./content";
import { notify, notifyClassmates } from "./messages";
import { fmtShort, plural } from "./dates";
import { collabClose, collabEmit, collabFlush, collabKick, collabReplace } from "./collab";
import type { User } from "./session";

export class ServiceError extends Error {}
/** Poznámka se mezitím změnila jinde (jiné okno, zařízení); ukládání se zastaví, aby nic nepřepsalo novější verzi. */
export class ConflictError extends ServiceError {}
const fail = (message: string): never => {
  throw new ServiceError(message);
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Zadej platné datum (RRRR-MM-DD).");
/** Prohlížeč posílá konce řádků z formulářů jako CRLF (2 znaky), ale do maxLength je počítá jako 1, takže dlouhý text by server zbytečně odmítl. */
const unixNewlines = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v]));
};

const parse = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> => {
  const r = schema.safeParse(unixNewlines(value));
  if (!r.success) {
    const i = r.error.issues[0];
    if (i.code === "too_big" && i.origin === "string") fail(`Text je moc dlouhý (nejvýš ${i.maximum} znaků).`);
    if (i.code === "too_small" && i.origin === "string" && i.message.startsWith("Too small")) fail("Vyplň tohle pole.");
    fail(i.message);
  }
  return (r as z.ZodSafeParseSuccess<z.output<T>>).data;
};

/* ---------- úkoly, testy a zkoušení ---------- */

/** Skupinu určuje server: má-li uživatel u předmětu vlastní skupinu, je zadání jen pro ni, jinak pro celou třídu. */
function scopeFor(userId: number, subjectId: number) {
  const groups = subjectGroups(userId, subjectId);
  if (!groups.length) fail("Tenhle předmět nemáš v rozvrhu.");
  return groups.find((g) => !g.whole_class)?.id ?? null;
}

const isPrivate = (v: unknown) => (v === true || v === "on" || v === "1" ? 1 : 0);
/** Cizí soukromá položka pro uživatele neexistuje; ostatní smí upravit autor nebo správce. */
function canManage(t: { created_by: number | null; private: number }, user: User, what: string, detail?: string) {
  if (t.private && t.created_by !== user.id) fail(`${what} neexistuje.`);
  if (t.created_by !== user.id && user.role !== "admin") fail(`Upravit nebo smazat ${what.toLowerCase()} může jen ten, kdo ${what === "Událost" ? "ji přidal" : "ho zadal"}, nebo správce.`);
  // správce zasahuje do cizí položky: zapíše se, co a čí to bylo
  if (t.created_by !== user.id) audit(user, "admin_content", { targetUser: t.created_by ? { id: t.created_by, name: get<{ name: string }>("SELECT name FROM users WHERE id = ?", t.created_by)?.name } : null, target: what, detail });
}

export function createTask(user: User, input: { title: unknown; subject?: unknown; due?: unknown; note?: unknown; private?: unknown }) {
  const v = parse(
    z.object({
      title: z.string().trim().min(1, "Napiš, co je potřeba udělat.").max(200),
      subject: z.preprocess((x) => (x === "" || x == null || x === 0 || x === "0" ? undefined : x), z.coerce.number().int().optional()),
      due: DATE.optional(),
      note: z.string().trim().max(2000).default(""),
    }),
    { ...input, due: input.due || undefined, note: input.note ?? "" },
  );
  const groupId = v.subject ? scopeFor(user.id, v.subject) : null;
  const id = Number(run("INSERT INTO tasks (class_id, group_id, subject_id, title, note, due_date, created_by, created_at, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", user.class_id, groupId, v.subject ?? null, v.title, v.note, v.due ?? null, user.id, Date.now(), isPrivate(input.private)).lastInsertRowid);
  const subjectName = v.subject ? get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", v.subject)?.name : null;
  todoistSoon(user);
  if (!isPrivate(input.private)) notifyClassmates(user, groupId, { category: "classwork", title: `Nový úkol${subjectName ? `: ${subjectName}` : ""}`, body: `${v.title}${v.due ? ` · termín ${fmtShort(v.due)}` : ""} · od ${user.name}`, link: "/ukoly", key: `task:${id}` });
  return id;
}

export function setTaskDone(user: User, id: number, done?: boolean) {
  const visible = get(
    "SELECT 1 FROM tasks t WHERE t.id = :id AND t.class_id = :class AND (t.private = 0 OR t.created_by = :user) AND (t.group_id IS NULL OR t.group_id IN (SELECT group_id FROM user_subjects WHERE user_id = :user))",
    { id, class: user.class_id, user: user.id },
  );
  if (!visible) fail("Úkol neexistuje.");
  const isDone = !!get("SELECT 1 FROM task_done WHERE task_id = ? AND user_id = ?", id, user.id);
  const want = done ?? !isDone;
  if (want && !isDone) run("INSERT INTO task_done (task_id, user_id, done_at) VALUES (?, ?, ?)", id, user.id, Date.now());
  else if (!want && isDone) run("DELETE FROM task_done WHERE task_id = ? AND user_id = ?", id, user.id);
  todoistSoon(user);
  return want;
}

/** Úkol upraví ten, kdo ho zadal, nebo správce. Předmět a skupina se nemění (pro jiný předmět zadej nový úkol). */
export function updateTask(user: User, id: number, input: { title: unknown; due?: unknown; note?: unknown }) {
  const t = get<{ created_by: number | null; class_id: number; group_id: number | null; due_date: string | null; subject_id: number | null; private: number }>("SELECT created_by, class_id, group_id, due_date, subject_id, private FROM tasks WHERE id = ?", id);
  if (!t || t.class_id !== user.class_id) fail("Úkol neexistuje.");
  canManage(t!, user, "Úkol", `úprava (id ${id})`);
  const v = parse(z.object({ title: z.string().trim().min(1, "Napiš, co je potřeba udělat.").max(200), due: DATE.optional(), note: z.string().trim().max(2000).default("") }), { ...input, due: input.due || undefined, note: input.note ?? "" });
  run("UPDATE tasks SET title = ?, note = ?, due_date = ?, updated_by = ?, updated_at = ? WHERE id = ?", v.title, v.note, v.due ?? null, user.id, Date.now(), id);
  todoistSoon(user);
  if ((v.due ?? null) !== t!.due_date && !t!.private) {
    const subjectName = t!.subject_id ? get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", t!.subject_id)?.name : null;
    notifyClassmates(user, t!.group_id, { category: "classwork", title: `Změněn termín úkolu${subjectName ? `: ${subjectName}` : ""}`, body: `${v.title}${v.due ? ` · nově ${fmtShort(v.due)}` : " · bez termínu"} · od ${user.name}`, link: "/ukoly", key: `taskedit:${id}:${v.due ?? "-"}` });
  }
}

export function deleteTask(user: User, id: number) {
  const t = taskOwner(id);
  if (!t || t.class_id !== user.class_id) fail("Úkol neexistuje.");
  canManage(t!, user, "Úkol", `smazání (id ${id})`);
  run("DELETE FROM tasks WHERE id = ?", id);
  todoistSoon(user);
}

/** Test jde přidat jen k předmětu, který je ve stálém rozvrhu (když ho máme načtený). */
export function assertInPermanentTimetable(user: User, subjectId: number) {
  const tt = peekTimetable(user, "permanent");
  if (!tt) return;
  const bk = get<{ bk_id: string }>("SELECT bk_id FROM subjects WHERE id = ?", subjectId)?.bk_id;
  if (!bk || !tt.lessons.some((l) => l.subjectId === bk)) fail("Tenhle předmět není ve stálém rozvrhu, test ani zkoušení k němu přidat nejde.");
}

/** Test jde zadat jen na den v týdnu, kdy se předmět podle stálého rozvrhu učí. */
export function assertTaughtOn(user: User, subjectId: number, date: string, outsideLesson = false) {
  const dow = dowOf(date);
  if (dow > 5) fail("Test ani zkoušení nejde zadat na víkend.");
  if (outsideLesson) return; // uživatel potvrdil, že test je i mimo den výuky
  const tt = peekTimetable(user, "permanent");
  if (!tt) return;
  const subj = get<{ bk_id: string; name: string }>("SELECT bk_id, name FROM subjects WHERE id = ?", subjectId);
  if (!subj) return;
  const days = [...new Set(tt.lessons.filter((l) => l.subjectId === subj.bk_id).map((l) => l.day))].sort();
  if (days.length && !days.includes(dow)) fail(`${subj.name} se v ${dayName(dow).toLowerCase()} podle stálého rozvrhu neučí. Test nebo zkoušení jde zadat jen v den výuky (${days.map((d) => dayName(d).toLowerCase()).join(", ")}).`);
}

const MAX_REPEATS = 45;

/** Zadá test; s `repeat: "weekly"` ho zopakuje každý týden až do data `until` (výchozí je konec školního roku). */
const isFlag = (v: unknown) => (v === true || v === "on" || v === "1" || v === 1 ? 1 : 0);
const makeupTitle = (makeup: number, title: string) => (makeup ? title.replace("Nový test", "Nový náhradní test").replace("Nové zkoušení", "Nové náhradní zkoušení") : title);

export function createTest(user: User, input: { subject: unknown; date: unknown; topic?: unknown; repeat?: unknown; until?: unknown; outsideLesson?: unknown; private?: unknown; makeup?: unknown; oral?: unknown }) {
  const v = parse(z.object({ subject: z.coerce.number().int(), date: DATE, topic: z.string().trim().max(300).default(""), repeat: z.enum(["none", "weekly"]).default("none"), until: DATE.optional() }), {
    ...input,
    topic: input.topic ?? "",
    repeat: input.repeat || "none",
    until: input.until || undefined,
  });
  const groupId = scopeFor(user.id, v.subject);
  assertInPermanentTimetable(user, v.subject);
  assertTaughtOn(user, v.subject, v.date, input.outsideLesson === true || input.outsideLesson === "on"); // opakování je vždy ve stejný den v týdnu, stačí zkontrolovat první termín
  const dates = [v.date];
  if (v.repeat === "weekly") {
    const until = v.until ?? schoolYearEnd(v.date);
    if (until < v.date) fail("Konec opakování nemůže být před prvním termínem.");
    for (let d = addDays(v.date, 7); d <= until; d = addDays(d, 7)) dates.push(d);
    if (dates.length > MAX_REPEATS) fail(`Opakovat jde nejvýš ${MAX_REPEATS}× najednou. Zkrať období.`);
  }
  const ids = tx(() =>
    dates.flatMap((date) => {
      const dup = get("SELECT 1 FROM tests WHERE class_id = ? AND subject_id = ? AND date = ? AND group_id IS ? AND private = ? AND (private = 0 OR created_by = ?)", user.class_id, v.subject, date, groupId, isPrivate(input.private), user.id);
      if (dup) return [];
      return [Number(run("INSERT INTO tests (class_id, group_id, subject_id, date, topic, created_by, created_at, private, makeup, oral) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", user.class_id, groupId, v.subject, date, v.topic, user.id, Date.now(), isPrivate(input.private), isFlag(input.makeup), isFlag(input.oral)).lastInsertRowid)];
    }),
  );
  if (!ids.length) fail(isFlag(input.oral) ? "Tohle zkoušení už je zadané." : "Tenhle test už je zadaný.");
  const subjectName = get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", v.subject)?.name ?? "Test";
  const repeated = ids.length > 1;
  if (!isPrivate(input.private)) notifyClassmates(user, groupId, {
    category: "classwork",
    title: repeated ? `${isFlag(input.oral) ? "Nová opakovaná zkoušení" : "Nové opakované testy"}: ${subjectName}` : makeupTitle(isFlag(input.makeup), `${isFlag(input.oral) ? "Nové zkoušení" : "Nový test"}: ${subjectName}`),
    body: `${fmtShort(v.date)}${repeated ? `, každý týden do ${fmtShort(dates[dates.length - 1])}` : ""}${v.topic ? ` · ${v.topic}` : ""} · od ${user.name}`,
    link: "/testy-a-zkouseni",
    key: `test:${ids[0]}`,
  });
  return ids[0];
}

/** Test upraví ten, kdo ho zadal, nebo správce. Datum se kontroluje podle stálého rozvrhu stejně jako při zadání. */
export function updateTest(user: User, id: number, input: { date: unknown; topic?: unknown; outsideLesson?: unknown; makeup?: unknown; oral?: unknown }) {
  const t = get<{ created_by: number | null; class_id: number; group_id: number | null; subject_id: number; date: string; private: number; oral: number }>("SELECT created_by, class_id, group_id, subject_id, date, private, oral FROM tests WHERE id = ?", id);
  const oral = input.oral === undefined ? (t?.oral ?? 0) : isFlag(input.oral);
  if (!t || t.class_id !== user.class_id) fail("Test ani zkoušení neexistuje.");
  canManage(t!, user, "Test nebo zkoušení", `úprava (id ${id})`);
  const v = parse(z.object({ date: DATE, topic: z.string().trim().max(300).default("") }), { date: input.date, topic: input.topic ?? "" });
  assertTaughtOn(user, t!.subject_id, v.date, input.outsideLesson === true || input.outsideLesson === "on");
  if (get("SELECT 1 FROM tests WHERE class_id = ? AND subject_id = ? AND date = ? AND group_id IS ? AND id != ?", t!.class_id, t!.subject_id, v.date, t!.group_id, id)) fail("V ten den už tenhle test nebo zkoušení je zadané.");
  run("UPDATE tests SET date = ?, topic = ?, makeup = ?, oral = ?, updated_by = ?, updated_at = ? WHERE id = ?", v.date, v.topic, isFlag(input.makeup), oral, user.id, Date.now(), id);
  if (v.date !== t!.date && !t!.private) {
    const name = get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", t!.subject_id)?.name ?? "Test";
    notifyClassmates(user, t!.group_id, { category: "classwork", title: `Změněn termín ${oral ? "zkoušení" : "testu"}: ${name}`, body: `${fmtShort(t!.date)} → ${fmtShort(v.date)}${v.topic ? ` · ${v.topic}` : ""} · od ${user.name}`, link: "/testy-a-zkouseni", key: `testedit:${id}:${v.date}` });
  }
}

export function deleteTest(user: User, id: number) {
  const t = testOwner(id);
  if (!t || t.class_id !== user.class_id) fail("Test ani zkoušení neexistuje.");
  canManage(t!, user, "Test nebo zkoušení", `smazání (id ${id})`);
  run("DELETE FROM tests WHERE id = ?", id);
}

/* ---------- poznámky ---------- */

const MAX_CONTENT = 2_000_000;
const MAX_TEXT = 300_000;

const ownSubject = (userId: number, subject: unknown) => {
  if (subject == null || subject === "" || subject === 0) return null;
  const id = Number(subject);
  return userSubjects(userId).some((s) => s.id === id) ? id : fail("Tenhle předmět nemáš v rozvrhu.");
};

export const defaultNoteTitle = (user: User) => renderNoteTitle(user.note_title_template);

/** Zkontroluje obsah poznámky a vrátí ho očištěný (např. bez obrázků z cizích adres). */
function checkDoc(content: string): string {
  if (content.length > MAX_CONTENT) fail("Poznámka je moc dlouhá.");
  try {
    if (JSON.parse(content)?.type !== "doc") throw new Error();
    return cleanDoc(content);
  } catch {
    return fail("Neplatný obsah.");
  }
}

export function createNote(user: User, input: { subject?: unknown; title?: string; content?: string; text?: string } = {}) {
  const now = Date.now();
  const content = input.content ? checkDoc(input.content) : "";
  return Number(
    run(
      "INSERT INTO notes (user_id, subject_id, title, content, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      user.id, ownSubject(user.id, input.subject), (input.title ?? defaultNoteTitle(user)).trim().slice(0, 200), content, (input.text ?? "").slice(0, MAX_TEXT), now, now,
    ).lastInsertRowid,
  );
}

export function updateNote(user: User, id: number, patch: { title?: string; subject?: unknown; content?: string; text?: string }, baseRev?: number): { updatedAt: number; rev: number } {
  if (patch.title !== undefined && patch.title.length > 200) fail("Název je moc dlouhý.");
  const content = patch.content !== undefined ? checkDoc(patch.content) : undefined;
  if ((patch.text ?? "").length > MAX_TEXT) fail("Poznámka je moc dlouhá.");
  collabFlush(id); // rozepsané změny spolupracovníků se zapíšou dřív, než se poznámka čte
  const r = tx(() => {
    const cur = get<{ title: string; subject_id: number | null; content: string; text: string; rev: number; user_id: number }>(
      `SELECT n.title, n.subject_id, n.content, n.text, n.rev, n.user_id FROM notes n
       WHERE n.id = ? AND n.deleted_at IS NULL AND (n.user_id = ? OR EXISTS (SELECT 1 FROM note_collaborators c WHERE c.note_id = n.id AND c.user_id = ?))`,
      id, user.id, user.id,
    );
    if (!cur) return fail("Poznámka neexistuje.");
    if (baseRev !== undefined && baseRev !== cur.rev) throw new ConflictError("Poznámka se mezitím změnila jinde.");
    snapshot(id, "auto", { newSize: (content ?? cur.content).length });
    const now = Date.now();
    // předmět je věc vlastníka; spolupracovník mění jen název a obsah
    const subject = patch.subject === undefined || cur.user_id !== user.id ? cur.subject_id : ownSubject(user.id, patch.subject);
    run(
      "UPDATE notes SET title = ?, subject_id = ?, content = ?, text = ?, rev = rev + 1, updated_at = ? WHERE id = ?",
      (patch.title ?? cur.title).trim(), subject, content ?? cur.content, patch.text ?? cur.text, now, id,
    );
    // změna jen názvu nebo předmětu sdílený dokument nepoškodí, stačí mu nové číslo verze
    if (content === undefined) run("UPDATE note_ydocs SET rev = ? WHERE note_id = ? AND rev = ?", cur.rev + 1, id, cur.rev);
    return { updatedAt: now, rev: cur.rev + 1, content };
  });
  if (r.content !== undefined) {
    collabReplace(id, r.content); // text se změnil mimo editor: otevřená okna se přepíšou
    pruneImages(id, r.content); // obrázky, které z textu zmizely, se po hodině smažou
  } else if (patch.title !== undefined) collabEmit(id, "meta", { title: patch.title.trim() });
  return { updatedAt: r.updatedAt, rev: r.rev };
}

const MAX_BOARD = 8_000_000;
const IMG_MIME = /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif);/;

/** Zkontroluje scénu tabule (Excalidraw) a vrátí ji očištěnou: jen prvky, soubory s obrázky a barva pozadí. */
function checkBoard(raw: string): string {
  if (raw === "") return "";
  if (raw.length > MAX_BOARD) fail("Tabule je moc velká (nejvýš zhruba 8 MB, ubyl by ti obrázek).");
  if (raw.includes('"classmate-boards"')) {
    let env: { type?: unknown; boards?: { id?: unknown; name?: unknown; scene?: unknown }[] };
    try {
      env = JSON.parse(raw);
    } catch {
      return fail("Neplatná tabule.");
    }
    if (env.type !== "classmate-boards" || !Array.isArray(env.boards) || env.boards.length < 1 || env.boards.length > MAX_BOARDS) return fail("Neplatná tabule.");
    const seen = new Set<string>();
    const boards = env.boards.map((b) => {
      if (typeof b.id !== "string" || !/^[a-z0-9]{1,12}$/.test(b.id) || seen.has(b.id) || typeof b.scene !== "string") return fail("Neplatná tabule.");
      seen.add(b.id);
      const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 60) : DEFAULT_BOARD_NAME;
      return { id: b.id, name, scene: checkBoard(b.scene) };
    });
    return serializeBoards(boards);
  }
  let j: { elements?: unknown; files?: Record<string, { dataURL?: unknown; mimeType?: unknown }>; appState?: { viewBackgroundColor?: unknown } };
  try {
    j = JSON.parse(raw);
  } catch {
    return fail("Neplatná tabule.");
  }
  if (!Array.isArray(j.elements) || j.elements.length > 20_000) fail("Neplatná tabule.");
  const files: Record<string, unknown> = {};
  for (const [id, f] of Object.entries(j.files ?? {})) {
    if (typeof f?.dataURL === "string" && IMG_MIME.test(f.dataURL)) files[id] = f; // jen obrázky, nic jiného
  }
  const bg = typeof j.appState?.viewBackgroundColor === "string" && /^#[0-9a-f]{3,8}$/i.test(j.appState.viewBackgroundColor) ? j.appState.viewBackgroundColor : undefined;
  return JSON.stringify({ type: "excalidraw", version: 2, elements: j.elements, appState: bg ? { viewBackgroundColor: bg } : {}, files });
}

/** Uložení tabule poznámky (jen vlastník). Prázdný řetězec tabuli smaže. `baseRev` chrání před přepsáním novější verze z jiného okna. */
export function saveBoard(user: User, id: number, board: string, baseRev?: number): { updatedAt: number; boardRev: number } {
  const clean = checkBoard(board);
  const r = tx(() => {
    const cur = get<{ board_rev: number }>(
      `SELECT n.board_rev FROM notes n WHERE n.id = ? AND n.deleted_at IS NULL AND (n.user_id = ? OR EXISTS (SELECT 1 FROM note_collaborators c WHERE c.note_id = n.id AND c.user_id = ?))`,
      id, user.id, user.id,
    );
    if (!cur) return fail("Poznámka neexistuje.");
    if (baseRev !== undefined && baseRev !== cur.board_rev) throw new ConflictError("Tabule se mezitím změnila jinde.");
    snapshot(id, "auto", { newSize: clean.length });
    const now = Date.now();
    run("UPDATE notes SET board = ?, board_rev = board_rev + 1, updated_at = ? WHERE id = ?", clean, now, id);
    return { updatedAt: now, boardRev: cur.board_rev + 1 };
  });
  collabEmit(id, "board", { rev: r.boardRev, by: user.id });
  return r;
}

/** Moje neuložená verze z jiného okna se uloží jako samostatná poznámka (nic se neztratí ani nepřepíše). */
export function saveNoteCopy(user: User, id: number, input: { title: string; content: string; text: string; board: string }) {
  const src = get<{ subject_id: number | null }>("SELECT subject_id FROM notes WHERE id = ? AND user_id = ?", id, user.id);
  if (!src) fail("Poznámka neexistuje.");
  const newId = createNote(user, { subject: src!.subject_id, title: `${input.title.trim() || "Poznámka"} (moje změny)`.slice(0, 200), content: input.content, text: input.text });
  if (input.board) run("UPDATE notes SET board = ? WHERE id = ?", checkBoard(input.board), newId);
  return newId;
}

export function restoreNoteVersion(user: User, id: number, versionId: number) {
  if (!get("SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, user.id)) fail("Poznámka neexistuje.");
  try {
    collabFlush(id);
    const at = restoreVersionRaw(id, versionId);
    const cur = get<{ content: string; title: string }>("SELECT content, title FROM notes WHERE id = ?", id);
    if (cur) {
      collabReplace(id, cur.content);
      collabEmit(id, "meta", { title: cur.title });
      collabEmit(id, "board", { rev: -1, by: 0 });
    }
    return at;
  } catch (e) {
    return fail((e as Error).message);
  }
}

export function setNotePinned(user: User, id: number, pinned?: boolean) {
  const cur = get<{ pinned: number }>("SELECT pinned FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, user.id);
  if (!cur) fail("Poznámka neexistuje.");
  const next = pinned === undefined ? 1 - cur!.pinned : pinned ? 1 : 0;
  run("UPDATE notes SET pinned = ? WHERE id = ? AND user_id = ?", next, id, user.id);
  return !!next;
}

/** „Smazání“ přesune poznámku do koše (30 dní), odkud jde obnovit. Soubory zůstávají, dokud se koš nevyprázdní. */
export function deleteNote(user: User, id: number) {
  collabFlush(id);
  if (!run("UPDATE notes SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL", Date.now(), id, user.id).changes) fail("Poznámka neexistuje.");
  collabClose(id, false);
}

export function restoreNote(user: User, id: number) {
  if (!run("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", Date.now(), id, user.id).changes) fail("Poznámka v koši neexistuje.");
}

/** Trvalé smazání z koše. */
export function purgeNote(user: User, id: number) {
  if (!get("SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", id, user.id)) fail("Poznámka v koši neexistuje.");
  purgeNoteNow(id);
}

/* ---------- sdílení poznámek ---------- */

/** Je poznámka vidět třídě: sdílená jednotlivě, nebo má autor zapnuté sdílení všech a tuhle poznámku z něj nevyřadil. */
export const isNoteShared = (n: { shared: number; unshared: number }, owner: { share_notes: number }) => !!n.shared || (!!owner.share_notes && !n.unshared);

/** Sdílení jedné poznámky. Při zapnutém „sdílet všechny“ znamená vypnutí vyřazení téhle poznámky (a zapnutí ji zase vrátí mezi sdílené). */
export function setNoteShared(user: User, id: number, shared?: boolean) {
  const cur = get<{ shared: number; unshared: number }>("SELECT shared, unshared FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, user.id);
  if (!cur) fail("Poznámka neexistuje.");
  const want = shared === undefined ? !isNoteShared(cur!, user) : shared;
  if (user.share_notes) run("UPDATE notes SET unshared = ?, shared = ? WHERE id = ? AND user_id = ?", want ? 0 : 1, want ? cur!.shared : 0, id, user.id);
  else run("UPDATE notes SET shared = ? WHERE id = ? AND user_id = ?", want ? 1 : 0, id, user.id);
  return want;
}

/** Přepínač „sdílet všechny moje poznámky“ – platí i pro budoucí. */
export function setShareAllNotes(user: User, enabled: boolean) {
  run("UPDATE users SET share_notes = ? WHERE id = ?", enabled ? 1 : 0, user.id);
  return enabled;
}

export function duplicateNote(user: User, id: number) {
  const n = get<{ title: string; subject_id: number | null; content: string; text: string; board: string }>("SELECT title, subject_id, content, text, board FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, user.id);
  if (!n) fail("Poznámka neexistuje.");
  const now = Date.now();
  const newId = Number(run("INSERT INTO notes (user_id, subject_id, title, content, text, board, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", user.id, n!.subject_id, `${n!.title} (kopie)`.slice(0, 200), n!.content, n!.text, n!.board, now, now).lastInsertRowid);
  const content = cloneImages(id, newId, n!.content); // kopie má vlastní obrázky
  if (content !== n!.content) run("UPDATE notes SET content = ? WHERE id = ?", content, newId);
  return newId;
}

export type SharedNoteRow = { id: number; title: string; text: string; updated_at: number; subject_id: number | null; subject_name: string | null; hue: string | null; author_id: number; author: string };

/**
 * Sdílené poznámky vidí jen lidé ze skupiny autora (dělená výuka): kdo s ním sdílí aspoň jednu skupinu, která není celá třída.
 * Má-li autor jen skupiny „celá třída“ (nebo žádné), vidí je celá třída. Pozvaní spolupracovníci to nepotřebují, ti mají přístup z pozvání.
 * Parametry: `@me` = čtenář, sloupec `n.user_id` = autor.
 */
const SAME_GROUP = `(NOT EXISTS (SELECT 1 FROM user_subjects us JOIN groups g ON g.id = us.group_id WHERE us.user_id = n.user_id AND g.whole_class = 0)
  OR EXISTS (SELECT 1 FROM user_subjects a JOIN user_subjects b ON b.group_id = a.group_id JOIN groups g ON g.id = a.group_id WHERE a.user_id = n.user_id AND b.user_id = @me AND g.whole_class = 0))`;

/** Poznámky spolužáků ze stejné třídy a skupiny, které je sdílí (jednotlivě nebo všechny). */
export function sharedNotes(user: User) {
  return all<SharedNoteRow>(
    `SELECT n.id, n.title, substr(n.text, 1, 30000) AS text, n.updated_at, n.subject_id, s.name AS subject_name, s.hue, u.id AS author_id, u.name AS author
     FROM notes n JOIN users u ON u.id = n.user_id LEFT JOIN subjects s ON s.id = n.subject_id
     WHERE n.deleted_at IS NULL AND u.class_id = @cls AND u.id != @me AND (n.shared = 1 OR (u.share_notes = 1 AND n.unshared = 0)) AND ${SAME_GROUP}
     ORDER BY cz(u.name), n.updated_at DESC`,
    { cls: user.class_id, me: user.id },
  );
}

/** Poznámky jednoho spolužáka, které smí čtenář vidět (stejná pravidla jako ve Sdílených: třída, sdílení a skupina). */
export function sharedNotesBy(user: User, authorId: number) {
  return all<{ id: number; title: string; updated_at: number; subject_name: string | null; hue: string | null }>(
    `SELECT n.id, n.title, n.updated_at, s.name AS subject_name, s.hue
     FROM notes n JOIN users u ON u.id = n.user_id LEFT JOIN subjects s ON s.id = n.subject_id
     WHERE n.deleted_at IS NULL AND u.class_id = @cls AND u.id = @author AND (n.shared = 1 OR (u.share_notes = 1 AND n.unshared = 0)) AND ${SAME_GROUP}
     ORDER BY n.updated_at DESC`,
    { cls: user.class_id, me: user.id, author: authorId },
  );
}

/** Poznámky, které si dva lidé společně upravují (jeden je vlastník, druhý pozvaný). */
export function collabNotesBetween(userId: number, otherId: number) {
  return all<{ id: number; title: string; updated_at: number; mine: number }>(
    `SELECT n.id, n.title, n.updated_at, (n.user_id = @me) AS mine
     FROM notes n JOIN note_collaborators c ON c.note_id = n.id
     WHERE n.deleted_at IS NULL AND ((n.user_id = @other AND c.user_id = @me) OR (n.user_id = @me AND c.user_id = @other))
     ORDER BY n.updated_at DESC`,
    { me: userId, other: otherId },
  );
}

export type NoteRole = "owner" | "editor" | "viewer";

/** Poznámka, kterou smí uživatel číst: vlastní, sdílená spolužákem ze třídy, nebo ta, ke které byl pozván jako spolupracovník (`role` říká, co s ní smí). */
export function readableNote(user: User, id: number, fresh = false) {
  if (fresh) collabFlush(id); // text rozepsaný ve společné úpravě se zapíše, ať se čte aktuální
  return get<{ id: number; title: string; content: string; board: string; rev: number; board_rev: number; subject_id: number | null; pinned: number; shared: number; unshared: number; updated_at: number; created_at: number; owner_id: number; author: string; subject: string | null; role: NoteRole; collab_count: number }>(
    `SELECT n.id, n.title, n.content, n.board, n.rev, n.board_rev, n.subject_id, n.pinned, n.shared, n.unshared, n.updated_at, n.created_at, u.id AS owner_id, u.name AS author, s.name AS subject,
            CASE WHEN n.user_id = @me THEN 'owner' WHEN EXISTS (SELECT 1 FROM note_collaborators c WHERE c.note_id = n.id AND c.user_id = @me) THEN 'editor' ELSE 'viewer' END AS role,
            (SELECT COUNT(*) FROM note_collaborators c WHERE c.note_id = n.id) AS collab_count
     FROM notes n JOIN users u ON u.id = n.user_id LEFT JOIN subjects s ON s.id = n.subject_id
     WHERE n.id = @id AND n.deleted_at IS NULL AND (n.user_id = @me OR EXISTS (SELECT 1 FROM note_collaborators c WHERE c.note_id = n.id AND c.user_id = @me)
           OR (u.class_id = @cls AND (n.shared = 1 OR (u.share_notes = 1 AND n.unshared = 0)) AND ${SAME_GROUP}))`,
    { id, me: user.id, cls: user.class_id },
  );
}

/** Poznámka, kterou smí uživatel upravovat: vlastní, nebo ta, ke které je pozvaný. */
export const editableNote = (user: User, id: number, fresh = false) => {
  const n = readableNote(user, id, fresh);
  return n && n.role !== "viewer" ? n : undefined;
};

/* ---------- společná úprava ---------- */

export const MAX_COLLABORATORS = 20;
export type Collaborator = { user_id: number; name: string; created_at: number };

export const noteCollaborators = (noteId: number) =>
  all<Collaborator>("SELECT c.user_id, u.name, c.created_at FROM note_collaborators c JOIN users u ON u.id = c.user_id WHERE c.note_id = ? ORDER BY c.created_at, cz(u.name)", noteId);

/** Spolužáci, které jde pozvat: registrovaní členové třídy, kteří ještě nejsou pozvaní. */
export const invitableClassmates = (user: User, noteId: number) =>
  all<{ id: number; name: string }>(
    `SELECT u.id, u.name FROM users u WHERE u.class_id = ? AND u.id != ? AND u.placeholder = 0
       AND u.id NOT IN (SELECT user_id FROM note_collaborators WHERE note_id = ?) ORDER BY cz(u.name)`,
    user.class_id, user.id, noteId,
  );

/** Vlastník pozve spolužáka ke společné úpravě. Poznámka zůstává vlastníkova, pozvaný ji vidí a upravuje s ním. */
export function inviteCollaborator(user: User, noteId: number, classmateId: number) {
  const note = get<{ title: string }>("SELECT title FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", noteId, user.id);
  if (!note) return fail("Poznámka neexistuje.");
  const target = get<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = ? AND class_id = ? AND placeholder = 0 AND id != ?", classmateId, user.class_id, user.id);
  if (!target) return fail("Pozvat jde jen registrovaného spolužáka ze třídy.");
  if (get("SELECT 1 FROM note_collaborators WHERE note_id = ? AND user_id = ?", noteId, target.id)) return target;
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM note_collaborators WHERE note_id = ?", noteId)?.n ?? 0) >= MAX_COLLABORATORS) fail(`Poznámku jde sdílet k úpravě nejvýš s ${MAX_COLLABORATORS} lidmi.`);
  const now = Date.now();
  run("INSERT INTO note_collaborators (note_id, user_id, invited_by, created_at) VALUES (?, ?, ?, ?)", noteId, target.id, user.id, now);
  notify(target.id, { category: "notes", title: `${user.name} tě pozval(a) k úpravě poznámky`, body: note.title || "Bez názvu", link: `/poznamky/${noteId}`, key: `collab:${noteId}:${target.id}:${now}` });
  return target;
}

/** Vlastník odebere spolupracovníka, spolupracovník může odejít sám. Posledním odebráním se poznámka vrátí k běžnému ukládání. */
export function removeCollaborator(user: User, noteId: number, targetId: number) {
  const note = get<{ user_id: number }>("SELECT user_id FROM notes WHERE id = ? AND deleted_at IS NULL", noteId);
  if (!note || (note.user_id !== user.id && targetId !== user.id)) return fail("Poznámka neexistuje.");
  collabFlush(noteId);
  if (!run("DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?", noteId, targetId).changes) return;
  collabKick(noteId, targetId);
}

/** Změna názvu (a vlastníkem i předmětu) při živé úpravě (bez čísla verze textu, ať se ostatní okna neruší). */
export function setNoteTitle(user: User, noteId: number, title: string, subject?: number | null) {
  if (title.length > 200) fail("Název je moc dlouhý.");
  const n = editableNote(user, noteId);
  if (!n) return fail("Poznámka neexistuje.");
  const clean = title.trim();
  run("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", clean, Date.now(), noteId);
  if (subject !== undefined && n.role === "owner") run("UPDATE notes SET subject_id = ? WHERE id = ?", ownSubject(user.id, subject), noteId);
  collabEmit(noteId, "meta", { title: clean });
}

export type CollabNoteRow = { id: number; title: string; text: string; updated_at: number; subject_name: string | null; hue: string | null; owner_id: number; owner: string };

/** Cizí poznámky, ke kterým jsem pozvaný jako spolupracovník. */
export const collaborativeNotes = (user: User) =>
  all<CollabNoteRow>(
    `SELECT n.id, n.title, substr(n.text, 1, 30000) AS text, n.updated_at, s.name AS subject_name, s.hue, u.id AS owner_id, u.name AS owner
     FROM note_collaborators c JOIN notes n ON n.id = c.note_id JOIN users u ON u.id = n.user_id LEFT JOIN subjects s ON s.id = n.subject_id
     WHERE c.user_id = ? AND n.deleted_at IS NULL ORDER BY n.updated_at DESC`,
    user.id,
  );

/* ---------- účet ---------- */

export function setNoteTitleTemplate(user: User, template: unknown) {
  const v = parse(z.string().trim().max(100, "Šablona je moc dlouhá."), template ?? "");
  run("UPDATE users SET note_title_template = ? WHERE id = ?", v || null, user.id);
}

/* ---------- správa (jen správce) ---------- */

function admin(user: User) {
  if (user.role !== "admin") fail("Tohle smí jen správce.");
}

function schoolUrl(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return normalizeBaseUrl(s);
  } catch (e) {
    return fail(e instanceof BakalariError ? e.message : "Neplatná adresa.");
  }
}

const schoolName = (v: unknown) => parse(z.string().trim().min(2, "Název školy musí mít aspoň 2 znaky.").max(100), v);
const className = (v: unknown) => parse(z.string().trim().min(1, "Zadej název třídy.").max(40), v);

const schoolLabel = (id: number) => get<{ name: string }>("SELECT name FROM schools WHERE id = ?", id)?.name ?? `škola ${id}`;
const classLabel = (id: number) => {
  const c = get<{ name: string; school: string }>("SELECT c.name, s.name AS school FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.id = ?", id);
  return c ? `${c.school} · ${c.name}` : `třída ${id}`;
};

export const adminOverview = (user: User) => {
  admin(user);
  return {
    counts: get<{ users: number; schools: number; classes: number }>("SELECT (SELECT COUNT(*) FROM users WHERE placeholder = 0 AND demo = 0) users, (SELECT COUNT(*) FROM schools WHERE demo = 0) schools, (SELECT COUNT(*) FROM classes WHERE school_id IN (SELECT id FROM schools WHERE demo = 0)) classes"),
    schools: all<{ id: number; name: string; bakalari_url: string | null; any_class: number; users: number }>("SELECT s.id, s.name, s.bakalari_url, s.any_class, (SELECT COUNT(*) FROM users WHERE school_id = s.id) users FROM schools s WHERE s.demo = 0 ORDER BY s.name"),
    classes: all<{ id: number; school_id: number; name: string; users: number }>("SELECT c.id, c.school_id, c.name, (SELECT COUNT(*) FROM users WHERE class_id = c.id AND placeholder = 0) users FROM classes c WHERE c.school_id IN (SELECT id FROM schools WHERE demo = 0) ORDER BY c.name"),
  };
};

export function adminUsers(user: User, q = "") {
  admin(user);
  return all<Record<string, unknown>>(
    `SELECT u.id, u.name, u.email, u.role, u.totp_enabled AS twoFactor, s.name AS school, c.name AS class, u.bakalari_username AS bakalariUser,
            (u.bakalari_refresh_enc IS NOT NULL) AS bakalariConnected, u.last_sync_at AS lastSync,
            (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND expires_at > :now) AS activeSessions
     FROM users u JOIN schools s ON s.id = u.school_id JOIN classes c ON c.id = u.class_id
     WHERE s.demo = 0 AND (:q = '' OR lower(u.name || ' ' || u.email || ' ' || c.name || ' ' || s.name) LIKE '%' || :q || '%') ORDER BY u.created_at`,
    { now: Date.now(), q: q.trim().toLowerCase() },
  );
}

export function adminCreateSchool(user: User, name: unknown, url: unknown) {
  admin(user);
  const n = schoolName(name);
  const id = Number(run("INSERT INTO schools (name, bakalari_url, created_at) VALUES (?, ?, ?)", n, schoolUrl(url), Date.now()).lastInsertRowid);
  audit(user, "school_create", { target: n });
  return id;
}

export function adminUpdateSchool(user: User, id: number, name: unknown, url: unknown) {
  admin(user);
  const n = schoolName(name);
  if (!run("UPDATE schools SET name = ?, bakalari_url = ? WHERE id = ?", n, schoolUrl(url), id).changes) fail("Škola neexistuje.");
  audit(user, "school_update", { target: n });
}

/** Uloží seznam studentů třídy (viz lib/roster.ts). Vrací, kolik neregistrovaných členů přibylo a kolik jich zmizelo. */
export function adminSetRoster(user: User, classId: number, text: unknown) {
  admin(user);
  try {
    const r = saveRoster(classId, String(text ?? ""));
    audit(user, "roster_set", { target: classLabel(classId), detail: `${r.total} jmen, přibylo ${r.added}, odebráno ${r.removed}` });
    return r;
  } catch (e) {
    if (e instanceof RosterError) fail(e.message);
    throw e;
  }
}

/** Přejmenuje registrovaného člena (jméno mu nastavuje správce, aby seděl se seznamem třídy). Řádek v seznamu se přepíše. */
export function adminRenameUser(user: User, userId: number, name: unknown) {
  admin(user);
  const n = parse(z.string().trim().min(2, "Napiš jméno aspoň o dvou znacích.").max(100, "Jméno je moc dlouhé.").transform((v) => v.replace(/\s+/g, " ")), name);
  const u = get<{ name: string; class_id: number; placeholder: number }>("SELECT name, class_id, placeholder FROM users WHERE id = ?", userId);
  if (!u) fail("Uživatel neexistuje.");
  if (u!.placeholder) fail("Člena bez účtu přejmenuj v seznamu studentů třídy.");
  const other = memberNamed(u!.class_id, n);
  if (other && other.id !== userId) fail("Ve třídě už je člověk se stejným jménem.");
  tx(() => {
    run("UPDATE users SET name = ? WHERE id = ?", n, userId);
    const names = rosterOf(u!.class_id).map((x) => (nameKey(x) === nameKey(u!.name) ? n : x));
    if (!names.some((x) => nameKey(x) === nameKey(n))) names.push(n);
    run("UPDATE classes SET roster = ? WHERE id = ?", names.join("\n"), u!.class_id);
  });
  audit(user, "user_rename", { targetUser: { id: userId, name: n }, detail: `dříve ${u!.name}` });
}

const mailDomain = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, "Koncovka e-mailů je ve tvaru ssps.cz.");

/** Umělá inteligence pro celou aplikaci: pořadí modelů (první je hlavní, ostatní zálohy) a API klíče Google AI, každé s komentářem. Pořadí v zaslaných datech je pořadí použití. */
export function adminAiSettings(user: User, raw: unknown) {
  admin(user);
  let data: unknown;
  try {
    data = JSON.parse(String(raw ?? ""));
  } catch {
    return fail("Nastavení se nepodařilo přečíst, zkus stránku obnovit.");
  }
  const note = z.string().trim().max(120).default("");
  const input = parse(
    z.object({
      models: z.array(z.object({ name: z.string().trim().regex(/^[a-z0-9._-]{2,80}$/i, "Název modelu smí mít jen písmena, čísla, tečky, pomlčky a podtržítka."), note })).max(30, "Modelů je moc, nech jich nejvýš 30."),
      keys: z.array(z.object({ id: z.string().optional(), key: z.string().trim().regex(/^[\x21-\x7e]{16,400}$/, "Klíč vypadá nesprávně (má být jedna řada znaků bez mezer).").optional(), note })).max(100, "Klíčů je moc, nech jich nejvýš 100."),
    }),
    data,
  );
  const have = new Map(getAiConfig().keys.map((k) => [k.id, k]));
  const seen = new Set<string>();
  const keys: AiKey[] = [];
  for (const k of input.keys) {
    const known = k.id ? have.get(k.id) : undefined;
    const item = known ? { ...known, note: k.note } : k.key ? { id: keyId(k.key), key: k.key, last4: k.key.slice(-4), note: k.note } : null;
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    keys.push(item);
  }
  const names = new Set<string>();
  const models = input.models.filter((m) => !names.has(m.name.toLowerCase()) && !!names.add(m.name.toLowerCase()));
  saveAiConfig(models.length ? models : DEFAULT_MODELS.map((name) => ({ name, note: "" })), keys);
  audit(user, "ai_settings", { detail: `${models.length} modelů, ${keys.length} klíčů` }); // klíče samotné se nikdy nezapisují
}

/** Školní e-mail u školy: Microsoft 365 (nic se nenastavuje, koncovka je v nastavení Microsoft 365), vlastní IMAP/SMTP, nebo vypnuto. */
export function adminSchoolMail(user: User, id: number, input: { kind: unknown; domain: unknown; imapHost: unknown; imapPort: unknown; smtpHost: unknown; smtpPort: unknown }) {
  admin(user);
  const school = get<{ ms_domain: string | null; ms_enabled: number }>("SELECT ms_domain, ms_enabled FROM schools WHERE id = ?", id);
  if (!school) fail("Škola neexistuje.");
  if (input.kind === "microsoft") {
    if (!school!.ms_enabled || !school!.ms_domain) fail("Nejdřív zapni Microsoft 365 u školy.");
    run("UPDATE schools SET mail_kind = 'microsoft' WHERE id = ?", id);
    audit(user, "school_mail", { target: schoolLabel(id), detail: "Microsoft 365" });
    return;
  }
  if (input.kind !== "imap") {
    run("UPDATE schools SET mail_kind = NULL WHERE id = ?", id);
    audit(user, "school_mail", { target: schoolLabel(id), detail: "vypnuto" });
    return;
  }
  const host = z.string().trim().max(200).regex(/^[a-z0-9.-]+$/i, "Server může mít jen písmena, čísla, tečky a pomlčky.").refine((h) => !internalHost(h), "Poštovní server musí být veřejná internetová adresa, ne adresa uvnitř sítě.");
  const port = z.coerce.number().int().min(1).max(65535);
  const domain = parse(z.object({ d: mailDomain }), { d: String(input.domain ?? "").replace(/^@/, "") }).d;
  const v = parse(z.object({ ih: host, ip: port, sh: host, sp: port }), { ih: input.imapHost, ip: input.imapPort || 993, sh: input.smtpHost, sp: input.smtpPort || 587 });
  run("UPDATE schools SET mail_kind = 'imap', mail_domain = ?, mail_imap_host = ?, mail_imap_port = ?, mail_smtp_host = ?, mail_smtp_port = ? WHERE id = ?", domain, v.ih, v.ip, v.sh, v.sp, id);
  audit(user, "school_mail", { target: schoolLabel(id), detail: `IMAP ${v.ih}:${v.ip}, SMTP ${v.sh}:${v.sp}, koncovka ${domain}` });
}

/** Microsoft 365 u školy: zapnout/vypnout a koncovka adres (třeba ssps.cz). Vypnutím se koncovka zachová, jen se přestane používat. */
export function adminSchoolMicrosoft(user: User, id: number, enabled: unknown, domain: unknown) {
  admin(user);
  if (!get("SELECT 1 FROM schools WHERE id = ?", id)) fail("Škola neexistuje.");
  const raw = String(domain ?? "").trim().replace(/^@/, "");
  const on = enabled === "1" || enabled === "on" || enabled === true;
  if (!on) {
    run("UPDATE schools SET ms_enabled = 0, ms_domain = COALESCE(NULLIF(?, ''), ms_domain), mail_kind = CASE WHEN mail_kind = 'microsoft' THEN NULL ELSE mail_kind END WHERE id = ?", /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(raw) ? raw.toLowerCase() : "", id);
    audit(user, "school_microsoft", { target: schoolLabel(id), detail: "vypnuto" });
    return;
  }
  if (!raw) fail("Napiš koncovku adres školy, třeba ssps.cz.");
  const d = parse(z.object({ d: mailDomain }), { d: raw }).d;
  run("UPDATE schools SET ms_enabled = 1, ms_domain = ? WHERE id = ?", d, id);
  audit(user, "school_microsoft", { target: schoolLabel(id), detail: `zapnuto, koncovka ${d}` });
}

/** Přepíná, jestli se do školy smí registrovat student kterékoli třídy z Bakalářů (třída se sama založí), nebo jen ze tříd, které správce založil. */
export function adminSchoolAnyClass(user: User, id: number, any: unknown) {
  admin(user);
  const on = any === "1" || any === "on" || any === true;
  if (!run("UPDATE schools SET any_class = ? WHERE id = ?", on ? 1 : 0, id).changes) fail("Škola neexistuje.");
  audit(user, "school_any_class", { target: schoolLabel(id), detail: on ? "povoleny všechny třídy z Bakalářů" : "jen povolené třídy" });
}

export function adminDeleteSchool(user: User, id: number) {
  admin(user);
  if (get("SELECT 1 FROM users WHERE school_id = ?", id)) fail("Škola má uživatele, nejdřív je přesuň.");
  const label = schoolLabel(id);
  run("DELETE FROM schools WHERE id = ?", id);
  audit(user, "school_delete", { target: label });
}

export function adminAddClass(user: User, schoolId: number, name: unknown) {
  admin(user);
  if (!get("SELECT 1 FROM schools WHERE id = ?", schoolId)) fail("Škola neexistuje.");
  const n = className(name);
  if (run("INSERT OR IGNORE INTO classes (school_id, name) VALUES (?, ?)", schoolId, n).changes) audit(user, "class_add", { target: `${schoolLabel(schoolId)} · ${n}` });
}

export function adminRenameClass(user: User, id: number, name: unknown) {
  admin(user);
  try {
    const before = classLabel(id);
    const n = className(name);
    if (!run("UPDATE classes SET name = ? WHERE id = ?", n, id).changes) fail("Třída neexistuje.");
    audit(user, "class_rename", { target: classLabel(id), detail: `dříve ${before}` });
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    fail("Třída s tímto názvem už ve škole existuje.");
  }
}

export function adminDeleteClass(user: User, id: number) {
  admin(user);
  if (get("SELECT 1 FROM users WHERE class_id = ? AND placeholder = 0", id)) fail("Ve třídě jsou uživatelé, nejdřív je přesuň.");
  const label = classLabel(id);
  audit(user, "class_delete", { target: label });
  tx(() => {
    run("DELETE FROM users WHERE class_id = ? AND placeholder = 1", id); // členové bez účtu ze seznamu třídy
    run("DELETE FROM classes WHERE id = ?", id);
  });
}

export function adminMoveUser(user: User, userId: number, classId: number) {
  admin(user);
  const target = get<{ id: number; school_id: number }>("SELECT id, school_id FROM classes WHERE id = ?", classId);
  if (!target) fail("Třída neexistuje.");
  const u = get<{ name: string; class_id: number; placeholder: number }>("SELECT name, class_id, placeholder FROM users WHERE id = ?", userId);
  if (!u) fail("Uživatel neexistuje.");
  if (u!.placeholder) fail("Člena bez účtu přesuneš úpravou seznamů studentů obou tříd.");
  if (u!.class_id === classId) return;
  if (memberNamed(classId, u!.name)) fail("V cílové třídě už je člověk se stejným jménem.");
  tx(() => {
    rosterRemove(u!.class_id, u!.name); // jméno přechází ze seznamu staré třídy do seznamu nové
    rosterAdd(classId, u!.name);
  });
  run("UPDATE users SET class_id = ?, school_id = ?, treasurer = 0 WHERE id = ?", target!.id, target!.school_id, userId); // role pokladníka patří k třídě
  run("DELETE FROM user_subjects WHERE user_id = ?", userId);
  run("DELETE FROM cache WHERE user_id = ?", userId);
  audit(user, "user_move", { targetUser: { id: userId, name: u!.name }, detail: `do ${classLabel(classId)}` });
}

const nameOf = (id: number) => get<{ name: string }>("SELECT name FROM users WHERE id = ?", id)?.name ?? null;

export function adminSignOutUser(user: User, userId: number) {
  admin(user);
  run("DELETE FROM sessions WHERE user_id = ?", userId);
  run("DELETE FROM oauth_tokens WHERE user_id = ?", userId);
  run("DELETE FROM app_devices WHERE user_id = ?", userId);
  audit(user, "user_signout", { targetUser: { id: userId, name: nameOf(userId) } });
}

export function adminResetTotp(user: User, userId: number) {
  admin(user);
  run("UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_pending_enc = NULL WHERE id = ?", userId);
  run("DELETE FROM recovery_codes WHERE user_id = ?", userId);
  audit(user, "user_totp_reset", { targetUser: { id: userId, name: nameOf(userId) } });
}

export function adminDisconnectBakalari(user: User, userId: number) {
  admin(user);
  run("UPDATE users SET bakalari_refresh_enc = NULL WHERE id = ?", userId);
  audit(user, "user_bakalari_disconnect", { targetUser: { id: userId, name: nameOf(userId) } });
}

/** Správce smaže uživateli všechny vyplněné kontakty (telefon, e-mail, sociální sítě a web) z profilu (například nevhodný odkaz). */
export function adminClearSocials(user: User, userId: number) {
  admin(user);
  if (!run("UPDATE users SET socials = NULL WHERE id = ?", userId).changes) fail("Uživatel neexistuje.");
  audit(user, "user_socials_clear", { targetUser: { id: userId, name: nameOf(userId) } });
}

export function adminSetPassword(user: User, userId: number, password: unknown) {
  admin(user);
  const pw = parse(z.string().max(200, "Heslo je moc dlouhé."), password);
  const weak = passwordProblem(pw);
  if (weak) fail(weak);
  if (get("SELECT 1 FROM users WHERE id = ? AND placeholder = 1", userId)) fail("Neregistrovaný člen se nepřihlašuje, heslo mu nastavit nejde.");
  if (!run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(pw), userId).changes) fail("Uživatel neexistuje.");
  // po změně hesla musí být uživatel odhlášen všude, včetně připojených AI aplikací
  run("DELETE FROM sessions WHERE user_id = ?", userId);
  run("DELETE FROM oauth_tokens WHERE user_id = ?", userId);
  run("DELETE FROM app_devices WHERE user_id = ?", userId);
  audit(user, "user_password_set", { targetUser: { id: userId, name: nameOf(userId) }, detail: "uživatel byl všude odhlášen" }); // heslo se nezapisuje
}

export function adminToggleAdmin(user: User, userId: number, makeAdmin?: boolean) {
  admin(user);
  if (userId === user.id) fail("Sám sobě roli měnit nemůžeš.");
  if (get("SELECT 1 FROM users WHERE id = ? AND placeholder = 1", userId)) fail("Neregistrovaný člen správcem být nemůže.");
  if (makeAdmin === undefined) run("UPDATE users SET role = CASE role WHEN 'admin' THEN 'user' ELSE 'admin' END WHERE id = ?", userId);
  else run("UPDATE users SET role = ? WHERE id = ?", makeAdmin ? "admin" : "user", userId);
  audit(user, "admin_toggle", { targetUser: { id: userId, name: nameOf(userId) }, detail: get<{ role: string }>("SELECT role FROM users WHERE id = ?", userId)?.role === "admin" ? "nyní správce" : "nyní běžný uživatel" });
}

/* ---------- vlastní události v kalendáři ---------- */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas zadej ve tvaru HH:MM.");
const EVENT = z.object({
  title: z.string().trim().min(1, "Napiš název události.").max(120, "Název je moc dlouhý."),
  date: DATE,
  start: TIME.optional(),
  end: TIME.optional(),
  note: z.string().trim().max(1000, "Poznámka je moc dlouhá.").default(""),
});
const MAX_EVENTS = 1000;

function parseEvent(input: Record<string, unknown>) {
  const v = parse(EVENT, { ...input, start: input.start || undefined, end: input.end || undefined, note: input.note ?? "" });
  if (v.end && !v.start) fail("Když zadáš konec, zadej i začátek.");
  if (v.start && v.end && v.end < v.start) fail("Konec nemůže být dřív než začátek.");
  return v;
}

/** Událost pro celou třídu (školní akce, výlet…). Upravit a smazat ji smí autor nebo správce. */
export function createCustomEvent(user: User, input: Record<string, unknown>) {
  const v = parseEvent(input);
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM custom_events WHERE user_id = ?", user.id)?.n ?? 0) >= MAX_EVENTS) fail("Máš moc událostí, nejdřív nějaké smaž.");
  const id = Number(run("INSERT INTO custom_events (user_id, class_id, date, title, start_time, end_time, note, created_at, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", user.id, user.class_id, v.date, v.title, v.start ?? null, v.end ?? null, v.note, Date.now(), isPrivate(input.private)).lastInsertRowid);
  if (!isPrivate(input.private)) notifyClassmates(user, null, { category: "classwork", title: "Nová událost ve třídě", body: `${v.title} · ${fmtShort(v.date)}${v.start ? ` ${v.start}` : ""} · od ${user.name}`, link: "/kalendar", key: `event:${id}` });
  return id;
}

function ownEvent(user: User, id: number) {
  const e = get<{ user_id: number; class_id: number; date: string; private: number }>("SELECT user_id, class_id, date, private FROM custom_events WHERE id = ?", id);
  if (!e || e.class_id !== user.class_id) fail("Událost neexistuje.");
  canManage({ created_by: e!.user_id, private: e!.private }, user, "Událost", `úprava nebo smazání (id ${id})`);
  return e!;
}

export function updateCustomEvent(user: User, id: number, input: Record<string, unknown>) {
  const v = parseEvent(input);
  const cur = ownEvent(user, id);
  run("UPDATE custom_events SET date = ?, title = ?, start_time = ?, end_time = ?, note = ?, updated_by = ?, updated_at = ? WHERE id = ?", v.date, v.title, v.start ?? null, v.end ?? null, v.note, user.id, Date.now(), id);
  if (v.date !== cur.date && !cur.private) notifyClassmates(user, null, { category: "classwork", title: "Změněn termín události", body: `${v.title} · ${fmtShort(cur.date)} → ${fmtShort(v.date)} · od ${user.name}`, link: "/kalendar", key: `eventedit:${id}:${v.date}` });
}

export function deleteCustomEvent(user: User, id: number) {
  ownEvent(user, id);
  run("DELETE FROM custom_events WHERE id = ?", id);
}

/** Uloží vlastní klávesové zkratky (uchová se jen to, co se liší od výchozích). */
export function setShortcuts(user: User, input: unknown) {
  const map = resolveKeys(JSON.stringify(input ?? {}));
  const err = validateKeys(map as KeyMap);
  if (err) fail(err);
  const diff = Object.fromEntries(SHORTCUTS.filter((s) => map[s.id] !== s.key).map((s) => [s.id, map[s.id]]));
  run("UPDATE users SET shortcuts = ? WHERE id = ?", Object.keys(diff).length ? JSON.stringify(diff) : null, user.id);
}

/* ---------- oznámení od správce ---------- */

export type { Audience } from "./announce";

/**
 * Správce pošle oznámení (zvonek a push, u tichého jen zvonek) všem, vybraným třídám, nebo konkrétním lidem; hned, nebo v naplánovaný čas (sendAt, ms),
 * a volitelně i e-mailem všem příjemcům (email). Odkaz smí vést jen dovnitř aplikace. Oznámení patří do kategorie „system“, kterou si uživatelé nevypínají.
 */
export function adminAnnounce(user: User, input: { title: unknown; body: unknown; link: unknown; audience: Audience; /** tiché: jen zvonek, bez upozornění na zařízení */ silent?: boolean; /** poslat i e-mailem */ email?: boolean; /** čas odeslání v ms; prázdné nebo minulé = hned */ sendAt?: number | null }): { count: number; scheduled: boolean } {
  admin(user);
  const v = parse(z.object({ title: z.string().trim().min(2, "Napiš nadpis oznámení.").max(120, "Nadpis je moc dlouhý."), body: z.string().trim().max(500, "Text je moc dlouhý (nejvíc 500 znaků).").default(""), link: z.string().trim().max(200).default("") }), { title: input.title, body: input.body ?? "", link: input.link ?? "" });
  if (v.link && !/^\/(?![/\\])[A-Za-z0-9/_\-?=&%.#]*$/.test(v.link)) fail("Odkaz musí vést dovnitř aplikace (začíná lomítkem, třeba /testy-a-zkouseni).");
  const a = input.audience;
  if (a.kind !== "all" && !a.ids.filter((n) => Number.isInteger(n) && n > 0).length) fail(a.kind === "classes" ? "Vyber aspoň jednu třídu." : "Vyber aspoň jednoho člověka.");
  if (input.email && !mailConfigured()) fail("Server zatím neumí posílat e-maily (chybí nastavení SMTP v .env).");
  if (input.sendAt != null && input.sendAt > Date.now() + 365 * 86_400_000) fail("Oznámení jde naplánovat nejvýš rok dopředu.");
  if (!rateLimit(`announce:${user.id}`, 20, 3600)) fail("Posíláš moc oznámení, zkus to za chvíli.");
  if (input.email && !rateLimit(`announce-mail:${user.id}`, 10, 86_400)) fail("Hromadných e-mailů jde poslat nejvýš 10 za den.");
  try {
    const r = createAnnouncement(user, { title: v.title, body: v.body, link: v.link, silent: !!input.silent, email: !!input.email, audience: a, sendAt: input.sendAt ?? null });
    return { count: r.count, scheduled: r.scheduled };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Oznámení se nepodařilo odeslat.");
  }
}

export function adminCancelAnnouncement(user: User, id: number) {
  admin(user);
  try {
    cancelAnnouncement(user, id);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Zrušení se nepodařilo.");
  }
}
