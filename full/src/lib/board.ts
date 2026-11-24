/**
 * Nástěnka třídy (volitelný modul): příspěvky spolužáků a správce, ankety, reakce a komentáře.
 * Všechno je jen v rámci třídy. Autor smí svůj příspěvek upravit a smazat, správce třídy smí smazat a připnout cokoli.
 * Proti zahlcení: omezený počet příspěvků a komentářů na den a velikost textů.
 */
import { all, get, run, tx } from "./db";
import { audit, classTarget } from "./audit";
import { notify } from "./messages";
import { layout } from "./email-notify";
import { mailConfigured, sendMail } from "./mail";
import { signToken } from "./mail-tokens";
import { siteUrl } from "./site";
import { pragueNow } from "./dates";
import type { User } from "./session";

export class BoardError extends Error {}
const fail = (m: string): never => {
  throw new BoardError(m);
};

export const BOARD_CATS = [
  { id: "info", label: "Oznámení", hint: "co by měla vědět celá třída" },
  { id: "event", label: "Akce", hint: "výlety, oslavy, sraz, sport" },
  { id: "money", label: "Sbírky a peníze", hint: "dárky, sbírky, kdo komu dluží" },
  { id: "swap", label: "Hledám a nabízím", hint: "půjčím sešit, hledám poznámky, prodám učebnici" },
  { id: "fun", label: "Zábava", hint: "vtipy, meme, nápady" },
] as const;
export type BoardCat = (typeof BOARD_CATS)[number]["id"];
export const isCat = (c: string): c is BoardCat => BOARD_CATS.some((x) => x.id === c);

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "👀"] as const;

const MAX_POSTS_DAY = 8;
const MAX_MAILED_DAY = 2;
const MAX_COMMENTS_DAY = 40;
const TITLE_MAX = 120;
const BODY_MAX = 2000;
const COMMENT_MAX = 500;

export const boardEnabled = (classId: number) => !!get<{ b: number }>("SELECT board_enabled b FROM classes WHERE id = ?", classId)?.b;

export type PostView = {
  id: number;
  category: BoardCat;
  title: string;
  body: string;
  link: string;
  pinned: boolean;
  poll: boolean;
  /** konec platnosti (RRRR-MM-DD) nebo null */
  expires: string | null;
  expired: boolean;
  createdAt: number;
  updatedAt: number | null;
  authorId: number;
  author: string;
  mine: boolean;
  options: { id: number; label: string; votes: number }[];
  myVote: number | null;
  totalVotes: number;
  reactions: { emoji: string; n: number; mine: boolean }[];
  comments: { id: number; userId: number; author: string; body: string; createdAt: number; mine: boolean }[];
};

type PostRow = { id: number; category: string; title: string; body: string; link: string; pinned: number; poll: number; expires: string | null; created_at: number; updated_at: number | null; user_id: number; author: string };

/** Příspěvky třídy: připnuté nahoře, pak nejnovější. Prošlé (po „platí do“) se ukážou jen v archivu. */
export function listPosts(user: User, opts: { cat?: string; archive?: boolean } = {}): PostView[] {
  const today = pragueNow().date;
  const rows = all<PostRow>(
    `SELECT p.id, p.category, p.title, p.body, p.link, p.pinned, p.poll, p.expires, p.created_at, p.updated_at, p.user_id, u.name AS author
     FROM board_posts p JOIN users u ON u.id = p.user_id
     WHERE p.class_id = ? ${opts.cat ? "AND p.category = ?" : ""} AND ${opts.archive ? "(p.expires IS NOT NULL AND p.expires < ?)" : "(p.expires IS NULL OR p.expires >= ?)"}
     ORDER BY ${opts.archive ? "p.expires DESC" : "p.pinned DESC, p.created_at DESC"}, p.id DESC LIMIT 200`,
    ...[user.class_id, ...(opts.cat ? [opts.cat] : []), today],
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const q = ids.map(() => "?").join(",");
  const options = all<{ id: number; post_id: number; label: string; votes: number }>(`SELECT o.id, o.post_id, o.label, (SELECT COUNT(*) FROM board_votes v WHERE v.option_id = o.id) AS votes FROM board_options o WHERE o.post_id IN (${q}) ORDER BY o.pos`, ...ids);
  const myVotes = new Map(all<{ post_id: number; option_id: number }>(`SELECT post_id, option_id FROM board_votes WHERE user_id = ? AND post_id IN (${q})`, user.id, ...ids).map((v) => [v.post_id, v.option_id]));
  const react = all<{ post_id: number; emoji: string; n: number; mine: number }>(`SELECT post_id, emoji, COUNT(*) AS n, MAX(user_id = ?) AS mine FROM board_reactions WHERE post_id IN (${q}) GROUP BY post_id, emoji`, user.id, ...ids);
  const comments = all<{ id: number; post_id: number; user_id: number; body: string; created_at: number; author: string }>(`SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.name AS author FROM board_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id IN (${q}) ORDER BY c.created_at, c.id`, ...ids);
  return rows.map((r) => {
    const opts_ = options.filter((o) => o.post_id === r.id);
    return {
      id: r.id,
      category: isCat(r.category) ? r.category : "info",
      title: r.title,
      body: r.body,
      link: r.link,
      pinned: !!r.pinned,
      poll: !!r.poll,
      expires: r.expires,
      expired: !!r.expires && r.expires < today,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      authorId: r.user_id,
      author: r.author,
      mine: r.user_id === user.id,
      options: opts_.map(({ id, label, votes }) => ({ id, label, votes })),
      myVote: myVotes.get(r.id) ?? null,
      totalVotes: opts_.reduce((n, o) => n + o.votes, 0),
      reactions: REACTIONS.map((e) => {
        const x = react.find((y) => y.post_id === r.id && y.emoji === e);
        return { emoji: e, n: x?.n ?? 0, mine: !!x?.mine };
      }),
      comments: comments.filter((c) => c.post_id === r.id).map((c) => ({ id: c.id, userId: c.user_id, author: c.author, body: c.body, createdAt: c.created_at, mine: c.user_id === user.id })),
    };
  });
}

/** Počty příspěvků podle kategorií (jen platné) a počet prošlých, pro záložky. */
export function boardCounts(user: User) {
  const today = pragueNow().date;
  const rows = all<{ category: string; n: number }>("SELECT category, COUNT(*) n FROM board_posts WHERE class_id = ? AND (expires IS NULL OR expires >= ?) GROUP BY category", user.class_id, today);
  const archived = get<{ n: number }>("SELECT COUNT(*) n FROM board_posts WHERE class_id = ? AND expires IS NOT NULL AND expires < ?", user.class_id, today)?.n ?? 0;
  return { byCat: Object.fromEntries(rows.map((r) => [r.category, r.n])) as Record<string, number>, total: rows.reduce((n, r) => n + r.n, 0), archived };
}

/** Kolik příspěvků od ostatních přibylo od poslední návštěvy nástěnky (odznak v menu). */
export function newPosts(user: User): number {
  if (!user.board_enabled) return 0;
  const seen = get<{ s: number }>("SELECT seen_at s FROM board_seen WHERE user_id = ?", user.id)?.s ?? 0;
  const today = pragueNow().date;
  return get<{ n: number }>("SELECT COUNT(*) n FROM board_posts WHERE class_id = ? AND user_id != ? AND created_at > ? AND (expires IS NULL OR expires >= ?)", user.class_id, user.id, seen || Date.now() - 7 * 86_400_000, today)?.n ?? 0;
}
export const markSeen = (userId: number) => void run("INSERT INTO board_seen (user_id, seen_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET seen_at = excluded.seen_at", userId, Date.now());

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
function safeLink(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") fail("Odkaz musí začínat http nebo https.");
    return u.toString().slice(0, 500);
  } catch (e) {
    if (e instanceof BoardError) throw e;
    return fail("Odkaz nevypadá správně.");
  }
}
const goodDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type PostInput = { id?: number; category: string; title: string; body: string; link: string; expires: string; pinned: boolean; notify: boolean; email: boolean; options: string[] };

function needMember(user: User) {
  if (!boardEnabled(user.class_id)) fail("Nástěnka není ve vaší třídě zapnutá.");
}

export function savePost(user: User, input: PostInput) {
  needMember(user);
  const title = clean(input.title, TITLE_MAX);
  const body = clean(input.body, BODY_MAX);
  if (!title) fail("Napiš nadpis.");
  const category = isCat(input.category) ? input.category : "info";
  const link = safeLink(clean(input.link, 500));
  const expires = input.expires && goodDate(input.expires) ? input.expires : null;
  if (expires && expires < pragueNow().date) fail("Datum „platí do“ nesmí být v minulosti.");
  const pinned = user.role === "admin" && input.pinned ? 1 : 0;

  if (input.id) {
    const p = get<{ user_id: number; poll: number }>("SELECT user_id, poll FROM board_posts WHERE id = ? AND class_id = ?", input.id, user.class_id);
    if (!p) return fail("Příspěvek už neexistuje.");
    if (p.user_id !== user.id && user.role !== "admin") fail("Tenhle příspěvek upravit nemůžeš.");
    run("UPDATE board_posts SET category = ?, title = ?, body = ?, link = ?, expires = ?, updated_at = ? WHERE id = ?", category, title, body, link, expires, Date.now(), input.id);
    if (user.role === "admin") run("UPDATE board_posts SET pinned = ? WHERE id = ?", pinned, input.id);
    return input.id;
  }

  const since = Date.now() - 86_400_000;
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM board_posts WHERE user_id = ? AND created_at > ?", user.id, since)?.n ?? 0) >= MAX_POSTS_DAY) fail(`Za posledních 24 hodin jsi přidal(a) ${MAX_POSTS_DAY} příspěvků, zkus to později.`);
  const options = input.options.map((o) => clean(o, 80)).filter(Boolean);
  if (input.options.length && options.length < 2) fail("Anketa potřebuje aspoň dvě možnosti.");
  if (options.length > 8) fail("V anketě může být nejvýš 8 možností.");
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) fail("Možnosti v anketě se nesmí opakovat.");

  const wantMail = input.notify && input.email && mailConfigured();
  if (wantMail && (get<{ n: number }>("SELECT COUNT(*) n FROM board_posts WHERE user_id = ? AND mailed = 1 AND created_at > ?", user.id, since)?.n ?? 0) >= MAX_MAILED_DAY) fail(`E-mailem jde upozornit nejvýš ${MAX_MAILED_DAY}× za 24 hodin. Zveřejni příspěvek jen s upozorněním v Classmate.`);

  const id = tx(() => {
    const r = run("INSERT INTO board_posts (class_id, user_id, category, title, body, link, pinned, poll, expires, created_at, mailed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", user.class_id, user.id, category, title, body, link, pinned, options.length ? 1 : 0, expires, Date.now(), wantMail ? 1 : 0);
    const pid = Number(r.lastInsertRowid);
    options.forEach((label, i) => run("INSERT INTO board_options (post_id, label, pos) VALUES (?, ?, ?)", pid, label, i));
    return pid;
  });
  if (input.notify) {
    const others = all<{ id: number }>("SELECT id FROM users WHERE class_id = ? AND id != ? AND placeholder = 0", user.class_id, user.id);
    tx(() => {
      others.forEach((o) => notify(o.id, { category: "board", title: `Nástěnka: ${title}`, body: body.slice(0, 200), link: "/nastenka", key: `board:${id}` }));
      if (wantMail) {
        // e-mail dostanou i ti, kdo Classmate nepoužívají; kdo má e-mailová upozornění zapnutá, by jinak dostal tutéž věc dvakrát
        run("INSERT OR IGNORE INTO board_mail (post_id, user_id) SELECT ?, id FROM users WHERE class_id = ? AND id != ? AND placeholder = 0 AND demo = 0 AND board_mail_off = 0 AND email NOT LIKE '%@bez-uctu.invalid'", id, user.class_id, user.id);
        run("UPDATE messages SET emailed_at = ? WHERE key = ? AND emailed_at IS NULL AND user_id IN (SELECT user_id FROM board_mail WHERE post_id = ?)", Date.now(), `board:${id}`, id);
      }
    });
    if (wantMail) void boardMailTick();
  }
  return id;
}

export function deletePost(user: User, id: number) {
  const p = get<{ user_id: number; title: string }>("SELECT user_id, title FROM board_posts WHERE id = ? AND class_id = ?", id, user.class_id);
  if (!p) return;
  if (p.user_id !== user.id && user.role !== "admin") fail("Tenhle příspěvek smazat nemůžeš.");
  run("DELETE FROM board_posts WHERE id = ?", id);
  if (p.user_id !== user.id) audit(user, "module_change", { target: classTarget(user.class_id), detail: `Nástěnka: smazán příspěvek „${p.title.slice(0, 60)}“` });
}

export function setPinned(user: User, id: number, pinned: boolean) {
  if (user.role !== "admin") fail("Připnout smí jen správce.");
  run("UPDATE board_posts SET pinned = ? WHERE id = ? AND class_id = ?", pinned ? 1 : 0, id, user.class_id);
}

export function vote(user: User, postId: number, optionId: number) {
  needMember(user);
  const p = get<{ poll: number; expires: string | null }>("SELECT poll, expires FROM board_posts WHERE id = ? AND class_id = ?", postId, user.class_id);
  if (!p?.poll) return fail("Tohle není anketa.");
  if (p.expires && p.expires < pragueNow().date) fail("Anketa už skončila.");
  if (!get("SELECT 1 FROM board_options WHERE id = ? AND post_id = ?", optionId, postId)) fail("Taková možnost není.");
  // klepnutí na vybranou možnost hlas zruší, jiná možnost ho přesune
  const mine = get<{ option_id: number }>("SELECT option_id FROM board_votes WHERE post_id = ? AND user_id = ?", postId, user.id)?.option_id;
  if (mine === optionId) run("DELETE FROM board_votes WHERE post_id = ? AND user_id = ?", postId, user.id);
  else run("INSERT INTO board_votes (post_id, user_id, option_id) VALUES (?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET option_id = excluded.option_id", postId, user.id, optionId);
}

export function react(user: User, postId: number, emoji: string) {
  needMember(user);
  if (!(REACTIONS as readonly string[]).includes(emoji)) return;
  if (!get("SELECT 1 FROM board_posts WHERE id = ? AND class_id = ?", postId, user.class_id)) return;
  const r = run("DELETE FROM board_reactions WHERE post_id = ? AND user_id = ? AND emoji = ?", postId, user.id, emoji);
  if (!r.changes) run("INSERT OR IGNORE INTO board_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)", postId, user.id, emoji);
}

export function addComment(user: User, postId: number, text: string) {
  needMember(user);
  const body = clean(text, COMMENT_MAX);
  if (!body) fail("Napiš komentář.");
  if (!get("SELECT 1 FROM board_posts WHERE id = ? AND class_id = ?", postId, user.class_id)) fail("Příspěvek už neexistuje.");
  if ((get<{ n: number }>("SELECT COUNT(*) n FROM board_comments WHERE user_id = ? AND created_at > ?", user.id, Date.now() - 86_400_000)?.n ?? 0) >= MAX_COMMENTS_DAY) fail("Dnes už jsi napsal(a) hodně komentářů, zkus to později.");
  run("INSERT INTO board_comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", postId, user.id, body, Date.now());
}

export function deleteComment(user: User, id: number) {
  const c = get<{ user_id: number; post_id: number }>("SELECT c.user_id, c.post_id FROM board_comments c JOIN board_posts p ON p.id = c.post_id WHERE c.id = ? AND p.class_id = ?", id, user.class_id);
  if (!c) return;
  if (c.user_id !== user.id && user.role !== "admin") fail("Tenhle komentář smazat nemůžeš.");
  run("DELETE FROM board_comments WHERE id = ?", id);
}

export function adminSetBoard(admin: User, classId: number, enabled: boolean) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  if (!get("SELECT 1 FROM classes WHERE id = ?", classId)) fail("Třída neexistuje.");
  run("UPDATE classes SET board_enabled = ? WHERE id = ?", enabled ? 1 : 0, classId);
  audit(admin, "module_change", { target: classTarget(classId), detail: `Nástěnka třídy ${enabled ? "zapnuta" : "vypnuta"}` });
}

/* ---------- e-maily z nástěnky ---------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unsub = (userId: number) => `${siteUrl()}/odhlasit-email?t=${signToken({ p: "boardmail", u: userId }, 2 * 365 * 86_400_000)}`;

function mailFor(r: { title: string; body: string; author: string; email: string; user_id: number; name: string }) {
  const url = `${siteUrl()}/nastenka`;
  const first = r.name.split(" ")[0] ?? "";
  const paras = r.body ? r.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : "";
  const u = unsub(r.user_id);
  const html = layout(r.title, `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.55">Ahoj ${esc(first)}, ${esc(r.author)} přidal(a) na nástěnku vaší třídy a chtěl(a) tě upozornit:</p>${paras}`, `Tenhle e-mail ti poslal spolužák přes nástěnku třídy v Classmate. <a href="${u}" style="color:#6b6f76">Už mi e-maily z nástěnky neposílat</a>.`, { label: "Otevřít nástěnku", url });
  const text = `Ahoj ${first},\n\n${r.author} přidal(a) na nástěnku vaší třídy:\n\n${r.title}${r.body ? `\n\n${r.body}` : ""}\n\nOtevřít nástěnku: ${url}\n\nUž mi e-maily z nástěnky neposílat: ${u}`;
  return { subject: `Nástěnka třídy: ${r.title}`, html, text, unsubscribeUrl: u };
}

let sending = false;
/** Pošle dávku e-mailů z fronty (postupně, aby se SMTP nezahltilo; po třech neúspěších se adresa vzdá). */
export async function boardMailTick() {
  if (sending || !mailConfigured()) return;
  sending = true;
  try {
    const stop = Date.now() + 40_000;
    for (;;) {
      const batch = all<{ post_id: number; user_id: number; email: string; name: string; title: string; body: string; author: string }>(
        `SELECT m.post_id, m.user_id, u.email, u.name, p.title, p.body, a.name AS author FROM board_mail m
         JOIN board_posts p ON p.id = m.post_id JOIN users u ON u.id = m.user_id JOIN users a ON a.id = p.user_id
         WHERE m.sent_at IS NULL AND m.attempts < 3 AND u.board_mail_off = 0 ORDER BY m.post_id, m.user_id LIMIT 20`,
      );
      if (!batch.length) return;
      for (const r of batch) {
        if (Date.now() > stop) return;
        try {
          await sendMail({ to: r.email, ...mailFor(r) });
          run("UPDATE board_mail SET sent_at = ? WHERE post_id = ? AND user_id = ?", Date.now(), r.post_id, r.user_id);
        } catch (e) {
          run("UPDATE board_mail SET attempts = attempts + 1 WHERE post_id = ? AND user_id = ?", r.post_id, r.user_id);
          console.error("board mail failed for user", r.user_id, e instanceof Error ? e.message : e);
        }
        await new Promise((res) => setTimeout(res, 150));
      }
    }
  } finally {
    sending = false;
  }
}
