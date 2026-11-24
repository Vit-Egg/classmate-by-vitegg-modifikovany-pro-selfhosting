/**
 * Pokladna: volitelný modul po třídách. Pokladník (nebo správce) zadá požadovanou platbu pro celou třídu nebo skupinu,
 * každý člen dostane svůj řádek, který se označí buď osobně (hotově), nebo se zaplatí kartou přes Stripe Checkout.
 *
 * Bezpečnostní zásady:
 * - peníze jsou vždy celá čísla v haléřích a částka se bere výhradně z databáze, nikdy z požadavku prohlížeče;
 * - o každé akci rozhoduje serverová kontrola práv (`canManage` / vlastní řádek), skrytá tlačítka nic nechrání;
 * - platba kartou se uzná jen po ověření u Stripe (podepsaný webhook, nebo dotaz na Stripe API) a shodě částky, měny a řádku;
 * - klíče Stripe patří třídě (peníze jdou přímo na její účet), jsou v databázi šifrované a ven se nikdy nevrací;
 * - každá změna se zapisuje do auditního záznamu (cash_log).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { decrypt, encrypt } from "./crypto";
import { all, get, rateLimit, run, tx } from "./db";
import type { User } from "./session";
import { notify } from "./messages";
import { audit, classTarget } from "./audit";
import { siteUrl } from "./site";

export class CashError extends Error {}
const fail = (m: string): never => {
  throw new CashError(m);
};

export const MIN_STRIPE_CENTS = 1500; // Stripe v CZK neumí platby pod 15 Kč

/**
 * Poplatek Stripe za kartu platí student: pokladník dostane přesně částku z požadované platby. Cena pro kartu se dopočítá tak, aby po odečtení
 * poplatku (procento + pevná částka) zbylo právě tolik, kolik se chce vybrat. Výchozí sazba je standardní karta z EHP (1,5 % + 6,50 Kč), změníš ji
 * v .env (STRIPE_FEE_PERCENT, STRIPE_FEE_FIXED_CZK) a vypneš STRIPE_PASS_FEE=0. U prémiových a zahraničních karet je poplatek Stripe vyšší,
 * takže pokladníkovi u nich o pár korun zbude méně.
 */
export function cardTotal(netCents: number): { total: number; fee: number } {
  if ((process.env.STRIPE_PASS_FEE ?? "1").trim() === "0") return { total: netCents, fee: 0 };
  const pct = Math.min(Math.max(Number(process.env.STRIPE_FEE_PERCENT ?? 1.5), 0), 20) / 100;
  const fixed = Math.round(Math.min(Math.max(Number(process.env.STRIPE_FEE_FIXED_CZK ?? 6.5), 0), 500) * 100);
  const total = Math.ceil((netCents + fixed) / (1 - pct));
  return { total, fee: total - netCents };
}
export const MAX_CENTS = 10_000_000; // 100 000 Kč na jednu platbu

/* ---------- třída a práva ---------- */

type ClassRow = { id: number; name: string; cash_enabled: number; stripe_key_enc: string | null; stripe_webhook_enc: string | null; cash_iban: string | null; cash_account_name: string | null; cash_qr: number; cash_card: number; cash_personal: number };
export const classCash = (classId: number) => get<ClassRow>("SELECT id, name, cash_enabled, stripe_key_enc, stripe_webhook_enc, cash_iban, cash_account_name, cash_qr, cash_card, cash_personal FROM classes WHERE id = ?", classId);
export const cashEnabled = (classId: number) => !!classCash(classId)?.cash_enabled;

/** Smí uživatel spravovat Pokladnu dané třídy? Správce kteroukoli (zapnutou), pokladník jen svou. */
export const canManage = (user: Pick<User, "role" | "treasurer" | "class_id">, classId: number) => cashEnabled(classId) && (user.role === "admin" || (!!user.treasurer && user.class_id === classId));

/** Třídy, které uživatel spravuje (správce všechny zapnuté, pokladník svou). */
export function managedClasses(user: Pick<User, "role" | "treasurer" | "class_id">) {
  if (user.role === "admin") return all<{ id: number; name: string; school: string }>("SELECT c.id, c.name, s.name AS school FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.cash_enabled = 1 ORDER BY s.name, c.name");
  if (user.treasurer && cashEnabled(user.class_id)) return all<{ id: number; name: string; school: string }>("SELECT c.id, c.name, s.name AS school FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.id = ?", user.class_id);
  return [];
}

const log = (classId: number, actor: number | null, action: string, detail = "", requestId: number | null = null, paymentId: number | null = null) =>
  void run("INSERT INTO cash_log (class_id, request_id, payment_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", classId, requestId, paymentId, actor, action, detail.slice(0, 500), Date.now());

/* ---------- nastavení správcem ---------- */

export function adminSetCash(admin: User, classId: number, enabled: boolean) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  if (!classCash(classId)) fail("Třída neexistuje.");
  run("UPDATE classes SET cash_enabled = ? WHERE id = ?", enabled ? 1 : 0, classId);
  log(classId, admin.id, enabled ? "module_on" : "module_off");
  audit(admin, "module_change", { target: classTarget(classId), detail: `Pokladna ${enabled ? "zapnuta" : "vypnuta"}` });
}

export function adminSetTreasurer(admin: User, userId: number, on: boolean) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  const u = get<{ class_id: number; name: string; role: string }>("SELECT class_id, name, role FROM users WHERE id = ?", userId);
  if (!u) fail("Uživatel neexistuje.");
  if (get("SELECT 1 FROM users WHERE id = ? AND placeholder = 1", userId)) fail("Neregistrovaný člen pokladníkem být nemůže.");
  if (on && !cashEnabled(u!.class_id)) fail("Nejdřív zapni Pokladnu u jeho třídy.");
  run("UPDATE users SET treasurer = ? WHERE id = ?", on ? 1 : 0, userId);
  log(u!.class_id, admin.id, on ? "treasurer_on" : "treasurer_off", u!.name);
  audit(admin, "treasurer_set", { targetUser: { id: userId, name: u!.name }, detail: on ? "jmenován pokladníkem" : "pokladník odebrán" });
}

/** Uloží klíče Stripe třídy (šifrovaně). Klíč má být omezený (restricted) jen na Checkout Sessions. */
export function adminSetStripe(admin: User, classId: number, key: string, webhook: string) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  if (!classCash(classId)) fail("Třída neexistuje.");
  const k = key.trim();
  const w = webhook.trim();
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{16,250}$/.test(k)) fail("Klíč Stripe má začínat sk_live_, rk_live_ nebo sk_test_ (doporučený je omezený klíč rk_…).");
  if (!/^whsec_[A-Za-z0-9]{16,250}$/.test(w)) fail("Podpisový klíč webhooku má začínat whsec_.");
  run("UPDATE classes SET stripe_key_enc = ?, stripe_webhook_enc = ? WHERE id = ?", encrypt(k), encrypt(w), classId);
  log(classId, admin.id, "stripe_set", `…${k.slice(-4)}`);
  audit(admin, "stripe_set", { target: classTarget(classId), detail: "klíče se nezapisují" });
}

export function adminClearStripe(admin: User, classId: number) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  const m = methods(classId);
  if (m.card && !m.personal && !m.qr) fail("Karta je teď jediný zapnutý způsob platby. Nejdřív zapni jiný.");
  run("UPDATE classes SET stripe_key_enc = NULL, stripe_webhook_enc = NULL, cash_card = 0 WHERE id = ?", classId);
  log(classId, admin.id, "stripe_clear");
  audit(admin, "stripe_set", { target: classTarget(classId), detail: "klíče odstraněny" });
}

/** Je u třídy nastavený Stripe (jen ano/ne a konec klíče, nikdy ne klíč)? */
export function stripeStatus(classId: number): { on: boolean; last4: string; active: boolean } {
  const c = classCash(classId);
  if (!c?.stripe_key_enc || !c.stripe_webhook_enc) return { on: false, last4: "", active: false };
  try {
    // on = klíče jsou uložené, active = platba kartou je navíc zapnutá (jde ji vypnout, aniž by se klíče mazaly)
    return { on: true, last4: decrypt(c.stripe_key_enc).slice(-4), active: !!c.cash_card };
  } catch {
    return { on: false, last4: "", active: false };
  }
}

/* ---------- platba QR kódem (český standard SPAYD) ---------- */

/** Číslo účtu („19-2000145399/0800“ nebo IBAN) na IBAN. Kontroluje tvar i kontrolní číslice, jinak vrací null. */
export function toIban(raw: string): string | null {
  const s = raw.replace(/\s/g, "").toUpperCase();
  const mod97 = (str: string) => {
    let r = 0;
    for (const ch of str) r = (r * 10 + Number(ch)) % 97;
    return r;
  };
  const num = (str: string) => str.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return mod97(num(s.slice(4) + s.slice(0, 4))) === 1 ? s : null;
  const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const bban = m[3] + (m[1] ?? "").padStart(6, "0") + m[2].padStart(10, "0");
  const check = String(98 - mod97(num(bban + "CZ00"))).padStart(2, "0");
  return `CZ${check}${bban}`;
}

/** IBAN zpět na zvyklý český zápis (předčíslí-číslo/kód banky); cizí IBAN zůstane. */
export function accountView(iban: string): string {
  if (/^CZ\d{22}$/.test(iban)) {
    const bank = iban.slice(4, 8);
    const prefix = String(Number(iban.slice(8, 14)));
    const acc = String(Number(iban.slice(14))).padStart(2, "0");
    return `${prefix !== "0" ? `${prefix}-` : ""}${acc}/${bank}`;
  }
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

const ascii = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .,\-/]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

/** Řetězec pro QR platbu (SPAYD 1.0). Částka z databáze, variabilní symbol je číslo platby, zpráva jen v ASCII (bankovní aplikace diakritiku neberou). */
export function spayd(o: { iban: string; cents: number; vs: number; message: string; name?: string | null }): string {
  const parts = ["SPD", "1.0", `ACC:${o.iban}`, `AM:${(o.cents / 100).toFixed(2)}`, "CC:CZK", `X-VS:${String(o.vs).slice(-10)}`, `MSG:${ascii(o.message).slice(0, 60)}`];
  if (o.name && ascii(o.name)) parts.push(`RN:${ascii(o.name).slice(0, 35)}`);
  return parts.join("*");
}

/** Které způsoby platby třída nabízí: osobně, QR kód (když je zapnutý a má účet), karta (když je zapnutá a má klíče). */
export function methods(classId: number): { personal: boolean; qr: boolean; card: boolean } {
  const c = classCash(classId);
  return { personal: !!c?.cash_personal, qr: !!c?.cash_qr && !!c.cash_iban, card: stripeStatus(classId).active };
}

/**
 * Uloží způsoby platby třídy a účet pro QR. Aspoň jeden způsob musí zůstat zapnutý (jinak by členové neměli jak platit).
 * QR vyžaduje číslo účtu, karta uložené klíče Stripe.
 */
export function adminSetMethods(admin: User, classId: number, o: { personal: boolean; qr: boolean; card: boolean; account: string; name: string }) {
  if (admin.role !== "admin") fail("Tohle smí jen správce.");
  const c = classCash(classId);
  if (!c) return fail("Třída neexistuje.");
  const raw = o.account.trim();
  let iban: string | null = null;
  if (raw) {
    iban = toIban(raw);
    if (!iban) fail("Číslo účtu nesedí. Zadej ho jako 19-2000145399/0800 (nebo celý IBAN) a zkontroluj kód banky.");
  }
  if (o.qr && !iban && !c!.cash_iban) fail("Pro platbu QR kódem zadej číslo účtu.");
  if (o.card && !(c!.stripe_key_enc && c!.stripe_webhook_enc)) fail("Pro platbu kartou nejdřív ulož klíče Stripe.");
  if (!o.personal && !o.qr && !o.card) fail("Aspoň jeden způsob platby musí zůstat zapnutý.");
  run("UPDATE classes SET cash_personal = ?, cash_qr = ?, cash_card = ?, cash_iban = COALESCE(?, cash_iban), cash_account_name = ? WHERE id = ?", o.personal ? 1 : 0, o.qr ? 1 : 0, o.card ? 1 : 0, iban, o.name.trim().slice(0, 80) || null, classId);
  log(classId, admin.id, "methods", [o.personal && "osobně", o.qr && "QR", o.card && "karta"].filter(Boolean).join(", "));
}

export function qrSettings(classId: number): { on: boolean; account: string; name: string } {
  const c = classCash(classId);
  return { on: !!c?.cash_qr && !!c.cash_iban, account: c?.cash_iban ? accountView(c.cash_iban) : "", name: c?.cash_account_name ?? "" };
}

export type QrPay = { image: string; account: string; holder: string; amount: string; vs: string; message: string };

/** Údaje a QR kód pro platbu vlastního nezaplaceného řádku. Cizí a zaplacené řádky nic nevrátí. */
export async function qrFor(user: User, paymentId: number): Promise<QrPay | null> {
  const c = classCash(user.class_id);
  if (!c?.cash_enabled || !c.cash_qr || !c.cash_iban) return null;
  const p = get<{ id: number; amount_cents: number; title: string }>(
    "SELECT p.id, COALESCE(p.amount_cents, r.amount_cents) AS amount_cents, r.title FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.id = ? AND p.user_id = ? AND r.class_id = ? AND p.status = 'unpaid' AND p.exempt = 0 AND r.closed_at IS NULL",
    paymentId, user.id, user.class_id,
  );
  if (!p) return null;
  const message = `${p.title} ${user.name}`;
  const text = spayd({ iban: c.cash_iban, cents: p.amount_cents, vs: p.id, message, name: c.cash_account_name });
  const image = await QRCode.toDataURL(text, { margin: 2, width: 560, errorCorrectionLevel: "M" }); // PNG: jde zobrazit i stáhnout a poslat dál
  return { image, account: accountView(c.cash_iban), holder: c.cash_account_name ?? "", amount: kc(p.amount_cents), vs: String(p.id), message: ascii(message).slice(0, 60) };
}

function stripeKeys(classId: number): { key: string; webhook: string } | null {
  const c = classCash(classId);
  if (!c?.stripe_key_enc || !c.stripe_webhook_enc) return null;
  try {
    return { key: decrypt(c.stripe_key_enc), webhook: decrypt(c.stripe_webhook_enc) };
  } catch {
    return null;
  }
}

/* ---------- požadavky ---------- */

export type RequestRow = { exempt: number; pending: number; id: number; class_id: number; group_id: number | null; audience: string; title: string; note: string; amount_cents: number; due_date: string | null; created_at: number; closed_at: number | null; total: number; paid: number; paid_cents: number; /** součet částek všech, kdo mají platit */ total_cents: number; /** zbývá vybrat */ due_cents: number; /** kolika lidem je částka upravená */ custom: number; /** platba jen pro vybrané lidi */ people_only: number };

const SUMMARY = `SELECT r.id, r.class_id, r.group_id, r.audience, r.title, r.note, r.amount_cents, r.due_date, r.created_at, r.closed_at,
    (SELECT COUNT(*) FROM cash_payments p WHERE p.request_id = r.id AND p.exempt = 0) AS total,
    (SELECT COUNT(*) FROM cash_payments p WHERE p.request_id = r.id AND p.exempt = 1) AS exempt,
    (SELECT COUNT(*) FROM cash_payments p WHERE p.request_id = r.id AND p.status = 'paid') AS paid,
    (SELECT COALESCE(SUM(COALESCE(p.amount_cents, r.amount_cents)), 0) FROM cash_payments p WHERE p.request_id = r.id AND p.status = 'paid') AS paid_cents,
    (SELECT COALESCE(SUM(COALESCE(p.amount_cents, r.amount_cents)), 0) FROM cash_payments p WHERE p.request_id = r.id AND p.exempt = 0) AS total_cents,
    (SELECT COALESCE(SUM(COALESCE(p.amount_cents, r.amount_cents)), 0) FROM cash_payments p WHERE p.request_id = r.id AND p.exempt = 0 AND p.status = 'unpaid') AS due_cents,
    (SELECT COUNT(*) FROM cash_payments p WHERE p.request_id = r.id AND p.amount_cents IS NOT NULL) AS custom,
    r.people_only,
    (SELECT COUNT(*) FROM cash_payments p WHERE p.request_id = r.id AND p.status = 'unpaid' AND p.claimed_at IS NOT NULL) AS pending
  FROM cash_requests r`;

export const listRequests = (classId: number) => all<RequestRow>(`${SUMMARY} WHERE r.class_id = ? ORDER BY (r.closed_at IS NOT NULL), r.created_at DESC LIMIT 200`, classId);
export const getRequest = (id: number) => get<RequestRow>(`${SUMMARY} WHERE r.id = ?`, id);

/** Částka z textu („150“, „150,50“, „1 200 Kč“) v haléřích. Jen kladné číslo s nejvýš dvěma desetinnými místy. */
export function parseCzk(raw: unknown): number {
  const s = String(raw ?? "").replace(/\s|Kč|kč|CZK/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return fail("Zadej částku v korunách, třeba 150 nebo 150,50.");
  const cents = Math.round(Number(s) * 100);
  if (cents < 100) fail("Částka je moc malá (nejméně 1 Kč).");
  if (cents > MAX_CENTS) fail("Částka je moc velká (nejvíc 100 000 Kč).");
  return cents;
}

const members = (classId: number, groupId: number | null) =>
  all<{ id: number }>(
    groupId == null
      ? "SELECT id FROM users WHERE class_id = ?"
      : "SELECT id FROM users WHERE class_id = ? AND id IN (SELECT user_id FROM user_subjects WHERE group_id = ?)",
    ...(groupId == null ? [classId] : [classId, groupId]),
  ).map((r) => r.id);

/** Doplní řádky pro členy, kteří do okruhu přibyli později (např. nový spolužák). Uzavřené požadavky se nemění. */
function ensureRows(requestId: number, classId: number, groupId: number | null) {
  if (get("SELECT 1 FROM cash_requests WHERE id = ? AND people_only = 1", requestId)) return; // platba jen pro vybrané lidi se sama nedoplňuje
  for (const uid of members(classId, groupId)) run("INSERT OR IGNORE INTO cash_payments (request_id, user_id) VALUES (?, ?)", requestId, uid);
}

/** Částky po jednotlivcích: { id člena: částka } z formuláře (prázdné = běžná částka). */
function customAmounts(raw: Record<string, unknown> | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const [k, v] of Object.entries(raw ?? {})) {
    const uid = Number(k);
    if (!Number.isInteger(uid) || uid <= 0 || String(v ?? "").trim() === "") continue;
    out.set(uid, parseCzk(v));
  }
  return out;
}

export function createRequest(actor: User, classId: number, input: { title: unknown; note: unknown; amount: unknown; due: unknown; group: unknown; /** jen tihle lidé (id členů třídy) */ people?: number[]; /** vlastní částky { id člena: částka } */ amounts?: Record<string, unknown> }) {
  if (!canManage(actor, classId)) fail("Tuhle Pokladnu nespravuješ.");
  if (!rateLimit(`cash:create:${actor.id}`, 30, 3600)) fail("Zadáváš moc plateb, zkus to za chvíli.");
  const title = String(input.title ?? "").trim();
  if (title.length < 2 || title.length > 120) fail("Název platby má mít 2 až 120 znaků.");
  const note = String(input.note ?? "").trim();
  if (note.length > 1000) fail("Poznámka je moc dlouhá.");
  const due = String(input.due ?? "").trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Termín nemá platný tvar.");
  const cents = parseCzk(input.amount);
  const custom = customAmounts(input.amounts);
  const people = [...new Set((input.people ?? []).filter((n) => Number.isInteger(n) && n > 0))];
  let groupId: number | null = null;
  let audience = "Celá třída";
  const g = Number(input.group) || 0;
  if (people.length) {
    const ok = all<{ id: number }>(`SELECT id FROM users WHERE class_id = ? AND id IN (${people.map(() => "?").join(",")})`, classId, ...people).length;
    if (ok !== people.length) return fail("Vybraný člověk není v téhle třídě.");
    audience = people.length === 1 ? "Jen jeden člověk" : `Vybraní lidé (${people.length})`;
  } else if (g) {
    const row = get<{ id: number; label: string }>("SELECT id, label FROM groups WHERE id = ? AND class_id = ?", g, classId);
    if (!row) return fail("Vybraná skupina k téhle třídě nepatří.");
    groupId = row!.id;
    audience = `Skupina ${row!.label}`;
  }
  const id = tx(() => {
    const rid = Number(run("INSERT INTO cash_requests (class_id, group_id, audience, title, note, amount_cents, due_date, created_by, created_at, people_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", classId, groupId, audience, title, note, cents, due || null, actor.id, Date.now(), people.length ? 1 : 0).lastInsertRowid);
    if (people.length) for (const uid of people) run("INSERT OR IGNORE INTO cash_payments (request_id, user_id) VALUES (?, ?)", rid, uid);
    else ensureRows(rid, classId, groupId);
    let own = 0;
    for (const [uid, amount] of custom) own += run("UPDATE cash_payments SET amount_cents = ? WHERE request_id = ? AND user_id = ? AND ? != ?", amount, rid, uid, amount, cents).changes;
    log(classId, actor.id, "request_create", `${title} · ${(cents / 100).toFixed(2)} Kč · ${audience}${own ? ` · u ${own} upravená částka` : ""}`, rid);
    return rid;
  });
  if (!getRequest(id)?.total) fail("V tomhle okruhu nikdo není, platba nemá komu přijít.");
  return id;
}

function manageRequest(actor: User, requestId: number) {
  const r = get<{ id: number; class_id: number; title: string; closed_at: number | null }>("SELECT id, class_id, title, closed_at FROM cash_requests WHERE id = ?", requestId);
  if (!r || !canManage(actor, r.class_id)) return fail("Tuhle platbu nespravuješ.");
  return r!;
}

export function setClosed(actor: User, requestId: number, closed: boolean) {
  const r = manageRequest(actor, requestId);
  run("UPDATE cash_requests SET closed_at = ? WHERE id = ?", closed ? Date.now() : null, requestId);
  log(r.class_id, actor.id, closed ? "request_close" : "request_reopen", r.title, requestId);
}

/**
 * Platbu jde smazat kdykoliv, i když už někdo zaplatil (smažou se i záznamy o zaplacení). Do historie se zapíše, kolik se vybralo. Platby kartou se ve Stripe
 * nevracejí samy, ty se musí vrátit tam; záznam o nich přestane existovat, takže se hlásí v historii třídy.
 */
export function deleteRequest(actor: User, requestId: number) {
  const r = manageRequest(actor, requestId);
  const req = getRequest(requestId);
  const card = get<{ n: number }>("SELECT COUNT(*) n FROM cash_payments WHERE request_id = ? AND status = 'paid' AND method = 'stripe'", requestId)?.n ?? 0;
  log(r.class_id, actor.id, "request_delete", `${r.title}${req && req.paid ? ` · smazáno i ${req.paid} zaplacených (${(req.paid_cents / 100).toFixed(2)} Kč${card ? `, z toho ${card} kartou, vrať ji ve Stripe` : ""})` : ""}`, requestId);
  run("DELETE FROM cash_requests WHERE id = ?", requestId);
}

/** Vlastní částka u jedné platby (prázdná = částka požadavku). Jen u nezaplacené platby v otevřeném požadavku. */
export function setPaymentAmount(actor: User, paymentId: number, amount: unknown) {
  const p = get<{ id: number; status: string; class_id: number; closed_at: number | null; request_id: number; title: string; name: string; default_cents: number }>(
    "SELECT p.id, p.status, r.class_id, r.closed_at, p.request_id, r.title, u.name, r.amount_cents default_cents FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    paymentId,
  );
  if (!p || !canManage(actor, p.class_id)) return fail("Tuhle platbu nespravuješ.");
  if (p.closed_at) fail("Platba je uzavřená, nejdřív ji otevři.");
  if (p.status === "paid") fail("Zaplacené platbě už částku měnit nejde.");
  const blank = String(amount ?? "").trim() === "";
  const cents = blank ? null : parseCzk(amount);
  const value = cents === p.default_cents ? null : cents; // stejná jako běžná = bez úpravy
  run("UPDATE cash_payments SET amount_cents = ? WHERE id = ?", value, paymentId);
  log(p.class_id, actor.id, "amount_set", `${p.name} · ${p.title} · ${value == null ? `běžná částka (${(p.default_cents / 100).toFixed(2)} Kč)` : `${(value / 100).toFixed(2)} Kč`}`, p.request_id, paymentId);
}

/** Členové třídy, kteří u platby ještě nemají řádek (pro přidání dalšího člověka). */
export function peopleToAdd(actor: User, requestId: number) {
  const r = manageRequest(actor, requestId);
  return all<{ id: number; name: string }>("SELECT id, name FROM users WHERE class_id = ? AND id NOT IN (SELECT user_id FROM cash_payments WHERE request_id = ?) ORDER BY cz(name)", r.class_id, requestId);
}

/** Přidá k platbě další lidi z třídy (a případně jim nastaví vlastní částku). */
export function addPeople(actor: User, requestId: number, userIds: number[], amount?: unknown) {
  const r = manageRequest(actor, requestId);
  if (r.closed_at) fail("Platba je uzavřená, nejdřív ji otevři.");
  const ids = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) fail("Vyber aspoň jednoho člověka.");
  const def = get<{ amount_cents: number }>("SELECT amount_cents FROM cash_requests WHERE id = ?", requestId)!.amount_cents;
  const blank = String(amount ?? "").trim() === "";
  const cents = blank ? null : parseCzk(amount);
  const own = cents === def ? null : cents;
  tx(() => {
    for (const uid of ids) {
      const u = get<{ name: string }>("SELECT name FROM users WHERE id = ? AND class_id = ?", uid, r.class_id);
      if (!u) fail("Vybraný člověk není v téhle třídě.");
      const ins = run("INSERT OR IGNORE INTO cash_payments (request_id, user_id, amount_cents) VALUES (?, ?, ?)", requestId, uid, own);
      if (ins.changes) log(r.class_id, actor.id, "person_add", `${u!.name} · ${r.title}${own ? ` · ${(own / 100).toFixed(2)} Kč` : ""}`, requestId, Number(ins.lastInsertRowid));
    }
  });
}

/** Odebere z platby jen pro vybrané lidi člověka, který ještě nezaplatil ani nehlásí zaplacení. U plateb pro třídu nebo skupinu se používá „Nemusí platit“. */
export function removePerson(actor: User, paymentId: number) {
  const p = get<{ id: number; status: string; claimed_at: number | null; class_id: number; closed_at: number | null; request_id: number; title: string; name: string; people_only: number }>(
    "SELECT p.id, p.status, p.claimed_at, r.class_id, r.closed_at, p.request_id, r.title, u.name, r.people_only FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    paymentId,
  );
  if (!p || !canManage(actor, p.class_id)) return fail("Tuhle platbu nespravuješ.");
  if (!p.people_only) fail("U platby pro celou třídu nebo skupinu člověka neodebírej, použij „Nemusí platit“.");
  if (p.closed_at) fail("Platba je uzavřená, nejdřív ji otevři.");
  if (p.status === "paid" || p.claimed_at) fail("Tenhle člověk už zaplatil nebo hlásí zaplacení.");
  run("DELETE FROM cash_payments WHERE id = ?", paymentId);
  log(p.class_id, actor.id, "person_remove", `${p.name} · ${p.title}`, p.request_id, paymentId);
}

export type MemberPayment = { /** částka tohoto člena (běžná, nebo vlastní) */ amount_cents: number; /** částka je upravená */ custom: number; exempt: number; claimed_at: number | null; claim_method: string | null; id: number; user_id: number; name: string; status: "unpaid" | "paid"; method: "cash" | "stripe" | null; paid_at: number | null; marked_by: string | null };

export function requestPayments(actor: User, requestId: number): { request: RequestRow; payments: MemberPayment[] } {
  const r = manageRequest(actor, requestId);
  const req = getRequest(requestId)!;
  if (!req.closed_at) ensureRows(requestId, r.class_id, req.group_id);
  const payments = all<MemberPayment>(
    `SELECT p.id, p.user_id, u.name, p.status, p.method, p.paid_at, p.exempt, p.claimed_at, p.claim_method, m.name AS marked_by,
            COALESCE(p.amount_cents, r.amount_cents) AS amount_cents, (p.amount_cents IS NOT NULL) AS custom
     FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id AND u.class_id = ? LEFT JOIN users m ON m.id = p.marked_by
     WHERE p.request_id = ? ORDER BY (p.status = 'paid'), cz(u.name)`,
    r.class_id, requestId,
  );
  return { request: getRequest(requestId)!, payments };
}

export function requestLog(actor: User, requestId: number) {
  const r = manageRequest(actor, requestId);
  void r;
  return all<{ action: string; detail: string; created_at: number; actor: string | null }>(
    "SELECT l.action, l.detail, l.created_at, u.name AS actor FROM cash_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.request_id = ? ORDER BY l.created_at DESC LIMIT 100",
    requestId,
  );
}

/** Označí platbu jako zaplacenou osobně (hotově), nebo toto označení vrátí. Platbu kartou ručně změnit nejde. */
export function markCash(actor: User, paymentId: number, paid: boolean) {
  const p = get<{ id: number; request_id: number; user_id: number; status: string; method: string | null; claimed_at: number | null; class_id: number; closed_at: number | null; title: string; name: string }>(
    `SELECT p.id, p.request_id, p.user_id, p.status, p.method, p.claimed_at, r.class_id, r.closed_at, r.title, u.name
     FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    paymentId,
  );
  if (!p || !canManage(actor, p.class_id)) return fail("Tuhle platbu nespravuješ.");
  if (p.closed_at) fail("Platba je uzavřená, nejdřív ji otevři.");
  if (paid && get("SELECT 1 FROM cash_payments WHERE id = ? AND exempt = 1", paymentId)) fail("Člen má u téhle platby vyškrtnuto, nejdřív ho zařaď mezi platící.");
  const member = get("SELECT 1 FROM users WHERE id = ? AND class_id = ?", p.user_id, p.class_id);
  if (!member) fail("Uživatel už není ve třídě.");
  tx(() => {
    if (paid) {
      const r = run("UPDATE cash_payments SET status = 'paid', method = 'cash', paid_at = ?, marked_by = ? WHERE id = ? AND status = 'unpaid'", Date.now(), actor.id, paymentId);
      if (r.changes) {
        log(p.class_id, actor.id, "paid_cash", `${p.name} · ${p.title}`, p.request_id, paymentId);
        if (p.claimed_at && p.user_id !== actor.id) notify(p.user_id, { category: "cash", title: "Platba potvrzena", body: p.title, link: "/pokladna", key: `cash:ok:${paymentId}:${Date.now()}` });
      }
    } else {
      if (p.status === "paid" && p.method !== "cash") fail("Platba kartou jde vrátit jen přes Stripe.");
      const r = run("UPDATE cash_payments SET status = 'unpaid', method = NULL, paid_at = NULL, marked_by = NULL, claimed_at = NULL, claim_method = NULL WHERE id = ? AND status = 'paid' AND method = 'cash'", paymentId);
      if (r.changes) log(p.class_id, actor.id, "unpaid_cash", `${p.name} · ${p.title}`, p.request_id, paymentId);
    }
  });
}

/** Pokladník označí, že člen u téhle platby platit nemusí (nebo ho zase zařadí). Člen se pak nepočítá do celkové částky. Zaplacený člen vyškrtnout nejde. */
export function setExempt(actor: User, paymentId: number, exempt: boolean) {
  const p = get<{ id: number; user_id: number; status: string; class_id: number; closed_at: number | null; request_id: number; title: string; name: string }>(
    "SELECT p.id, p.user_id, p.status, r.class_id, r.closed_at, p.request_id, r.title, u.name FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    paymentId,
  );
  if (!p || !canManage(actor, p.class_id)) return fail("Tuhle platbu nespravuješ.");
  if (p.closed_at) fail("Platba je uzavřená, nejdřív ji otevři.");
  if (exempt && p.status === "paid") fail("Zaplacenou platbu vyškrtnout nejde, nejdřív zrušte označení zaplacení.");
  tx(() => {
    const r = run("UPDATE cash_payments SET exempt = ?, claimed_at = NULL, claim_method = NULL WHERE id = ?", exempt ? 1 : 0, paymentId);
    if (r.changes) log(p.class_id, actor.id, exempt ? "exempt_on" : "exempt_off", `${p.name} · ${p.title}`, p.request_id, paymentId);
  });
}

/** Nový člen třídy (např. neregistrovaný spolužák od správce) se přidá do otevřených plateb pro celou třídu. */
export function addToOpenRequests(classId: number, userId: number) {
  for (const r of all<{ id: number }>("SELECT id FROM cash_requests WHERE class_id = ? AND group_id IS NULL AND closed_at IS NULL AND people_only = 0", classId)) {
    run("INSERT OR IGNORE INTO cash_payments (request_id, user_id) VALUES (?, ?)", r.id, userId);
  }
}

/* ---------- „už jsem zaplatil“ a potvrzení pokladníkem ---------- */

/** Komu jde oznámení o platbě k potvrzení: pokladníkům třídy (i když je pokladník zároveň správce), a když žádný není, všem správcům. */
function managersOf(classId: number): number[] {
  const t = all<{ id: number }>("SELECT id FROM users WHERE class_id = ? AND treasurer = 1", classId).map((r) => r.id);
  return t.length ? t : all<{ id: number }>("SELECT id FROM users WHERE role = 'admin'").map((r) => r.id);
}

/** Člen tvrdí, že zaplatil (QR převodem, nebo osobně). Pokladníkovi přijde oznámení a platbu potvrdí nebo odmítne. */
export function claimPaid(user: User, paymentId: number, how: string) {
  if (how !== "qr" && how !== "cash") fail("Neznámý způsob platby.");
  const p = get<{ id: number; user_id: number; status: string; claimed_at: number | null; request_id: number; class_id: number; closed_at: number | null; title: string }>(
    "SELECT p.id, p.user_id, p.status, p.claimed_at, p.request_id, r.class_id, r.closed_at, r.title FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.id = ?",
    paymentId,
  );
  if (!p || p.user_id !== user.id || p.class_id !== user.class_id || !cashEnabled(p.class_id)) return fail("Platba neexistuje.");
  if (p.status === "paid") fail("Tohle už je zaplacené.");
  if (p.closed_at) fail("Platba je uzavřená.");
  if (get("SELECT 1 FROM cash_payments WHERE id = ? AND exempt = 1", paymentId)) fail("U téhle platby platit nemusíš.");
  const m = methods(p.class_id);
  if (how === "qr" ? !m.qr : !m.personal) fail("Tenhle způsob platby třída nenabízí.");
  if (p.claimed_at) fail("Pokladník už o platbě ví, čeká se na jeho potvrzení.");
  if (!rateLimit(`cash:claim:${user.id}`, 20, 3600)) fail("Moc pokusů, zkus to za chvíli.");
  tx(() => {
    run("UPDATE cash_payments SET claimed_at = ?, claim_method = ? WHERE id = ? AND status = 'unpaid' AND claimed_at IS NULL", Date.now(), how, paymentId);
    log(p.class_id, user.id, "claim", `${p.title} · ${how === "qr" ? "QR převodem" : "osobně"}`, p.request_id, paymentId);
  });
  for (const id of managersOf(p.class_id)) {
    if (id === user.id) continue;
    notify(id, { category: "cash", title: `${user.name} hlásí platbu`, body: `${p.title} · ${how === "qr" ? "převodem na účet (QR)" : "osobně"}. Potvrď, jestli ti dorazila.`, link: `/pokladna/${p.request_id}`, key: `cash:claim:${paymentId}:${Date.now()}` });
  }
}

/** Člen vezme své „už jsem zaplatil“ zpět (dokud pokladník nerozhodl). */
export function withdrawClaim(user: User, paymentId: number) {
  const r = run("UPDATE cash_payments SET claimed_at = NULL, claim_method = NULL WHERE id = ? AND user_id = ? AND status = 'unpaid'", paymentId, user.id);
  if (!r.changes) fail("Není co vracet.");
  const p = get<{ class_id: number; request_id: number }>("SELECT r.class_id, p.request_id FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.id = ?", paymentId);
  if (p) log(p.class_id, user.id, "claim_withdraw", "", p.request_id, paymentId);
}

/** Pokladník odmítne „už jsem zaplatil“ (platba nedorazila). Člen se to dozví a může to zkusit znovu. */
export function rejectClaim(actor: User, paymentId: number) {
  const p = get<{ id: number; user_id: number; status: string; claimed_at: number | null; class_id: number; request_id: number; title: string; name: string }>(
    "SELECT p.id, p.user_id, p.status, p.claimed_at, r.class_id, p.request_id, r.title, u.name FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    paymentId,
  );
  if (!p || !canManage(actor, p.class_id)) return fail("Tuhle platbu nespravuješ.");
  if (p.status !== "unpaid" || !p.claimed_at) fail("U téhle platby není co odmítat.");
  tx(() => {
    run("UPDATE cash_payments SET claimed_at = NULL, claim_method = NULL WHERE id = ?", paymentId);
    log(p.class_id, actor.id, "claim_reject", `${p.name} · ${p.title}`, p.request_id, paymentId);
  });
  notify(p.user_id, { category: "cash", title: "Platba nebyla potvrzena", body: `${p.title}: pokladníkovi platba nedorazila. Zkontroluj ji, nebo zaplať znovu.`, link: "/pokladna", key: `cash:rej:${paymentId}:${Date.now()}` });
}

/* ---------- pohled člena ---------- */

export type MyPayment = { claimed_at: number | null; claim_method: string | null; id: number; status: "unpaid" | "paid"; method: "cash" | "stripe" | null; paid_at: number | null; title: string; note: string; amount_cents: number; due_date: string | null; closed_at: number | null; audience: string };

/** Moje platby. Nejdřív se doplní řádky u otevřených požadavků, jejichž okruhu jsem se mezitím stal součástí. */
export function myPayments(user: User): MyPayment[] {
  if (!cashEnabled(user.class_id)) return [];
  for (const r of all<{ id: number; group_id: number | null }>("SELECT id, group_id FROM cash_requests WHERE class_id = ? AND closed_at IS NULL AND people_only = 0", user.class_id)) {
    if (r.group_id == null || get("SELECT 1 FROM user_subjects WHERE user_id = ? AND group_id = ?", user.id, r.group_id)) run("INSERT OR IGNORE INTO cash_payments (request_id, user_id) VALUES (?, ?)", r.id, user.id);
  }
  return all<MyPayment>(
    `SELECT p.id, p.status, p.method, p.paid_at, p.claimed_at, p.claim_method, r.title, r.note, COALESCE(p.amount_cents, r.amount_cents) AS amount_cents, r.due_date, r.closed_at, r.audience
     FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id
     WHERE p.user_id = ? AND r.class_id = ? AND p.exempt = 0 AND (p.status = 'paid' OR r.closed_at IS NULL)
     ORDER BY (p.status = 'paid'), COALESCE(r.due_date, '9999'), r.created_at DESC LIMIT 100`,
    user.id, user.class_id,
  );
}

/* ---------- Stripe ---------- */

const API = "https://api.stripe.com/v1";

async function stripe<T = any>(key: string, method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), "Stripe-Version": "2024-06-20" },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return fail("Stripe teď není dostupný, zkus to za chvíli.");
  }
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("[pokladna] Stripe", res.status, j?.error?.message);
    return fail(res.status === 401 || res.status === 403 ? "Stripe odmítl klíč třídy, ohlas to správci." : "Platbu se nepodařilo založit, zkus to znovu.");
  }
  return j as T;
}

/** Založí platbu kartou za vlastní řádek. Vrací adresu Stripe Checkout, na kterou se má prohlížeč přesměrovat. */
export async function startCheckout(user: User, paymentId: number): Promise<string> {
  const p = get<{ id: number; user_id: number; status: string; class_id: number; closed_at: number | null; title: string; amount_cents: number }>(
    "SELECT p.id, p.user_id, p.status, r.class_id, r.closed_at, r.title, COALESCE(p.amount_cents, r.amount_cents) AS amount_cents FROM cash_payments p JOIN cash_requests r ON r.id = p.request_id WHERE p.id = ?",
    paymentId,
  );
  // jen vlastní řádek ve vlastní třídě; cizí a neexistující se tváří stejně
  if (!p || p.user_id !== user.id || p.class_id !== user.class_id || !cashEnabled(p.class_id)) return fail("Platba neexistuje.");
  if (p.status === "paid") fail("Tohle už máš zaplacené.");
  if (p.closed_at) fail("Platba je uzavřená.");
  if (get("SELECT 1 FROM cash_payments WHERE id = ? AND exempt = 1", paymentId)) fail("U téhle platby platit nemusíš.");
  if (p.amount_cents < MIN_STRIPE_CENTS) fail("Kartou jdou platby od 15 Kč, tuhle zaplať osobně pokladníkovi.");
  const keys = stripeStatus(p.class_id).active ? stripeKeys(p.class_id) : null;
  if (!keys) fail("Platba kartou není u téhle třídy zapnutá.");
  if (!rateLimit(`cash:pay:${user.id}`, 20, 3600)) fail("Moc pokusů o platbu, zkus to za chvíli.");
  const base = siteUrl();
  const { total, fee } = cardTotal(p.amount_cents); // student platí cenu i s poplatkem Stripe, pokladníkovi zbyde přesně požadovaná částka
  const s = await stripe<{ id: string; url?: string }>(keys!.key, "POST", "/checkout/sessions", {
    mode: "payment",
    locale: "cs",
    client_reference_id: String(p.id),
    "metadata[payment_id]": String(p.id),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "czk",
    "line_items[0][price_data][unit_amount]": String(p.amount_cents),
    "line_items[0][price_data][product_data][name]": p.title.slice(0, 120),
    ...(fee > 0 ? { "line_items[1][quantity]": "1", "line_items[1][price_data][currency]": "czk", "line_items[1][price_data][unit_amount]": String(fee), "line_items[1][price_data][product_data][name]": "Poplatek za platbu kartou" } : {}),
    success_url: `${base}/pokladna?stav=zaplaceno&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pokladna?stav=zruseno`,
  });
  if (!s.id || !s.url || !s.url.startsWith("https://checkout.stripe.com/")) return fail("Stripe vrátil neočekávanou odpověď.");
  run("INSERT INTO cash_sessions (session_id, payment_id, amount_cents, created_at) VALUES (?, ?, ?, ?)", s.id, p.id, total, Date.now()); // uložená je celková částka na kartě (i s poplatkem), podle ní se ověřuje zaplacení
  log(p.class_id, user.id, "stripe_start", p.title, null, p.id);
  return s.url;
}

type Session = { id?: string; payment_status?: string; amount_total?: number; currency?: string; client_reference_id?: string };

/** Uzná zaplacení řádku podle ověřené relace Stripe. Částka a měna se porovnávají s tím, co jsme při založení uložili. */
function settle(classId: number, s: Session, via: "webhook" | "return"): boolean {
  if (!s.id || s.payment_status !== "paid") return false;
  const row = get<{ payment_id: number; amount_cents: number; class_id: number; status: string; method: string | null; stripe_session: string | null; title: string; name: string }>(
    `SELECT cs.payment_id, cs.amount_cents, r.class_id, p.status, p.method, p.stripe_session, r.title, u.name
     FROM cash_sessions cs JOIN cash_payments p ON p.id = cs.payment_id JOIN cash_requests r ON r.id = p.request_id JOIN users u ON u.id = p.user_id WHERE cs.session_id = ?`,
    s.id,
  );
  if (!row && s.client_reference_id && String(s.currency).toLowerCase() === "czk") log(classId, null, "stripe_orphan", `relace ${s.id} (${((s.amount_total ?? 0) / 100).toFixed(2)} Kč) je zaplacená, ale platba už neexistuje (třeba byla smazaná): vrať ji ve Stripe`, null, null);
  if (!row || row.class_id !== classId) return false; // relace jiné třídy nebo cizí
  if (s.amount_total !== row.amount_cents || String(s.currency).toLowerCase() !== "czk" || s.client_reference_id !== String(row.payment_id)) {
    log(classId, null, "stripe_mismatch", `${row.name} · ${row.title} · relace ${s.id}`, null, row.payment_id);
    return false;
  }
  return tx(() => {
    const r = run("UPDATE cash_payments SET status = 'paid', method = 'stripe', paid_at = ?, marked_by = NULL, stripe_session = ? WHERE id = ? AND status = 'unpaid'", Date.now(), s.id, row.payment_id);
    if (r.changes) {
      log(classId, null, "paid_stripe", `${row.name} · ${row.title} (${via})`, null, row.payment_id);
      return true;
    }
    // už bylo zaplaceno (např. hotově): peníze přišly dvakrát, pokladník to musí vyřešit ručně
    const sameSession = row.method === "stripe" && row.stripe_session === s.id; // tutéž platbu potvrdil návrat i webhook, to není chyba
    if (row.status === "paid" && !sameSession) log(classId, null, "stripe_duplicate", `${row.name} · ${row.title} · relace ${s.id}: platba už byla zaplacená, vrať ji ve Stripe`, null, row.payment_id);
    return false;
  });
}

/** Po návratu ze Stripe: relaci ověří přímo u Stripe (webhook může dorazit později). Jen pro vlastní řádek. */
export async function confirmReturn(user: User, sessionId: string): Promise<"paid" | "pending" | "unknown"> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return "unknown";
  const row = get<{ payment_id: number; status: string; class_id: number }>(
    "SELECT cs.payment_id, p.status, r.class_id FROM cash_sessions cs JOIN cash_payments p ON p.id = cs.payment_id JOIN cash_requests r ON r.id = p.request_id WHERE cs.session_id = ? AND p.user_id = ?",
    sessionId, user.id,
  );
  if (!row) return "unknown";
  if (row.status === "paid") return "paid";
  if (!rateLimit(`cash:confirm:${user.id}`, 30, 3600)) return "pending";
  const keys = stripeKeys(row.class_id);
  if (!keys) return "pending";
  try {
    const s = await stripe<Session>(keys.key, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    return settle(row.class_id, s, "return") || get<{ status: string }>("SELECT status FROM cash_payments WHERE id = ?", row.payment_id)?.status === "paid" ? "paid" : "pending";
  } catch {
    return "pending";
  }
}

/** Ověří podpis webhooku Stripe (HMAC-SHA256 nad „čas.tělo“, tolerance 5 minut, porovnání v konstantním čase). */
export function verifyStripeSignature(raw: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(",").map((x) => x.trim().split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d{9,12}$/.test(t) || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Zpracuje webhook Stripe třídy. Vrací HTTP stav: 400 špatný podpis, 200 vše ostatní (i ignorované události). */
export function handleWebhook(classId: number, raw: string, signature: string | null): number {
  const keys = stripeKeys(classId);
  if (!keys || !verifyStripeSignature(raw, signature, keys.webhook)) return 400;
  let ev: { id?: string; type?: string; data?: { object?: Session } };
  try {
    ev = JSON.parse(raw);
  } catch {
    return 400;
  }
  if (!ev.id || !/^evt_[A-Za-z0-9_]+$/.test(ev.id)) return 400;
  if (run("INSERT OR IGNORE INTO cash_events (id, created_at) VALUES (?, ?)", ev.id, Date.now()).changes === 0) return 200; // už zpracováno
  if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && ev.data?.object) settle(classId, ev.data.object, "webhook");
  return 200;
}

/** Stejný původ požadavku (ochrana proti CSRF u přímých volání API): hlavička Origin musí patřit tomuhle serveru. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Částka v haléřích jako „150 Kč“ nebo „150,50 Kč“. */
export const kc = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",").replace(",00", "")} Kč`;
