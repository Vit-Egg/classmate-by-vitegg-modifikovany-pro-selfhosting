/** Web Push: odesílání upozornění na zařízení, která si je zapnula. Klíče VAPID se vygenerují jednou a uloží do data/. */
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { all, run } from "./db";
import { dataDir } from "./paths";
import { pragueNow } from "./dates";
import { configuredUrl } from "./site";
import { fcmEnabled, sendFcm } from "./fcm";
import { DEFAULT_CONTACT } from "./contact";

type Keys = { publicKey: string; privateKey: string };
let keys: Keys | null = null;
let ready = false;

function loadKeys(): Keys {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const file = path.join(dataDir(), ".vapid.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  return (keys = JSON.parse(fs.readFileSync(file, "utf8")) as Keys);
}

function init() {
  if (ready) return;
  const k = loadKeys();
  const pub = configuredUrl();
  const subject = process.env.VAPID_SUBJECT?.trim() || (pub?.startsWith("https://") ? pub : `mailto:${DEFAULT_CONTACT}`);
  webpush.setVapidDetails(subject, k.publicKey, k.privateKey);
  ready = true;
}

export const vapidPublicKey = () => loadKeys().publicKey;

export type PushPayload = { title: string; body?: string; url?: string; tag?: string; category?: string };

/** Zařízení mobilní aplikace, kam jde poslat push (jen když je zapnuté FCM). */
function appTargets(userId: number) {
  if (!fcmEnabled()) return [];
  return all<{ id: number; fcm_token: string }>("SELECT id, fcm_token FROM app_devices WHERE user_id = ? AND fcm_token IS NOT NULL", userId);
}

/** Datová zpráva do aplikací uživatele; neplatný token FCM se zapomene (zařízení zůstane spárované pro widget). */
async function pushToApps(userId: number, data: Record<string, string>) {
  let sent = 0;
  await Promise.all(
    appTargets(userId).map(async (d) => {
      const r = await sendFcm(d.fcm_token, data);
      if (r === "ok") sent++;
      else if (r === "gone") run("UPDATE app_devices SET fcm_token = NULL WHERE id = ?", d.id);
    }),
  );
  return sent;
}

export async function pushToUser(userId: number, payload: PushPayload) {
  init();
  const subs = all<{ id: number; endpoint: string; p256dh: string; auth: string }>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 12 * 3600, urgency: "high" });
        run("UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?", Date.now(), s.id);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) run("DELETE FROM push_subscriptions WHERE id = ?", s.id); // odběr už neplatí
        else console.error("push failed", code ?? e);
      }
    }),
  );
  sent += await pushToApps(userId, { type: "message", title: payload.title, body: payload.body ?? "", url: payload.url ?? "/dnes", tag: payload.tag ?? "", category: payload.category ?? "" });
  return sent;
}

/** Tichá výzva aplikacím, ať si stáhnou čerstvý rozvrh (změna rozvrhu, i když má uživatel upozornění vypnutá). */
export function pushRefresh(userId: number) {
  void pushToApps(userId, { type: "refresh" }).catch(() => {});
}

/* ---------- pravidla pro zprávy: noční klid a ochrana před záplavou ---------- */

export function quiet() {
  const v = process.env.PUSH_QUIET_HOURS ?? "22-6";
  if (v === "off") return false;
  const [from, to] = v.split("-").map(Number);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const h = pragueNow().hour;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

const inflight = new Set<number>();
const WINDOW_MS = 12 * 3600_000; // starší upozornění už nemá smysl posílat

/**
 * Odešle uživateli čekající upozornění (zprávy s pushed_at IS NULL). Nic se nezahazuje:
 * v nočním klidu zprávy čekají do rána, při chybě se zkusí znovu při další kontrole (každou minutu) a víc zpráv najednou se sloučí do jedné.
 */
export async function deliverPending(userId: number) {
  if (inflight.has(userId)) return;
  inflight.add(userId);
  try {
    const now = Date.now();
    // přečtené v aplikaci nebo příliš staré se neposílají
    run("UPDATE messages SET pushed_at = ? WHERE user_id = ? AND pushed_at IS NULL AND (read_at IS NOT NULL OR created_at < ?)", now, userId, now - WINDOW_MS);
    const rows = all<{ id: number; title: string; body: string; link: string | null; category: string }>("SELECT id, title, body, link, category FROM messages WHERE user_id = ? AND pushed_at IS NULL ORDER BY created_at, id", userId);
    if (!rows.length) return;
    if (!all("SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1", userId).length && !appTargets(userId).length) {
      run("UPDATE messages SET pushed_at = ? WHERE user_id = ? AND pushed_at IS NULL", now, userId); // není kam posílat
      return;
    }
    if (quiet()) return; // počká do konce nočního klidu
    const mark = (ids: number[]) => run(`UPDATE messages SET pushed_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, Date.now(), ...ids);
    if (rows.length > 3) {
      const sent = await pushToUser(userId, { title: `${rows.length} nových oznámení`, body: rows.slice(0, 3).map((r) => r.title).join(" · ") + (rows.length > 3 ? " …" : ""), url: "/dnes", tag: "classmate-more" });
      if (sent > 0) mark(rows.map((r) => r.id));
      return;
    }
    for (const r of rows) {
      const sent = await pushToUser(userId, { title: r.title, body: r.body, url: r.link ?? "/dnes", tag: `classmate-${r.id}`, category: r.category });
      if (sent > 0) mark([r.id]);
    }
  } catch (e) {
    console.error("deliverPending", e);
  } finally {
    inflight.delete(userId);
  }
}

/** Nová zpráva: pokus o okamžité odeslání (nikdy neblokuje a nevyhazuje chybu); co se nepovede, dožene minutová kontrola. */
export function pushMessage(userId: number) {
  void deliverPending(userId);
}

/** Minutová kontrola čekajících upozornění všech uživatelů. */
export async function pushTick() {
  const users = all<{ user_id: number }>("SELECT DISTINCT user_id FROM messages WHERE pushed_at IS NULL");
  // po deseti naráz: při hromadné změně rozvrhu (suplování celé školy) by jinak odesílání po jednom trvalo déle než minutu
  for (let i = 0; i < users.length; i += 10) await Promise.all(users.slice(i, i + 10).map((u) => deliverPending(u.user_id)));
}

/**
 * Adresu odběru zadává prohlížeč, takže ji server nesmí slepě volat (SSRF). Povolujeme jen známé push služby;
 * další (např. pro testy) jdou přidat v PUSH_ALLOWED_HOSTS, oddělené čárkou.
 */
const KNOWN = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function allowedEndpoint(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || raw.length > 1000) return false;
    const extra = (process.env.PUSH_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return KNOWN.some((re) => re.test(u.hostname)) || extra.includes(u.hostname);
  } catch {
    return false;
  }
}
