/**
 * Audit log: záznam o tom, kdo, kdy a co udělal ve správě a u zabezpečení účtů. Vidí ho jen správce (Správa → Audit log).
 *
 * Ukládá se jen to, co k dohledání události stačí: kdo (jméno a číslo účtu), co, koho se to týkalo, krátký popis a IP adresa.
 * Nikdy se do něj nedává heslo, token, API klíč, obsah poznámek ani zpráv. Zápis nesmí nikdy shodit akci, ke které patří.
 * Řádky nemají cizí klíč na uživatele (přežijí smazání účtu), ale při smazání účtu se z nich jméno a IP odstraní (`forgetUser`).
 */
import { all, get, run } from "./db";

export type AuditCategory = "ucet" | "sprava" | "obsah";

export const AUDIT_ACTIONS = {
  // účet a přihlášení
  login: { label: "Přihlášení", cat: "ucet" },
  login_failed: { label: "Nepovedené přihlášení", cat: "ucet" },
  login_2fa_failed: { label: "Špatný kód dvoufázového ověření", cat: "ucet" },
  logout: { label: "Odhlášení", cat: "ucet" },
  register: { label: "Nová registrace", cat: "ucet" },
  register_blocked: { label: "Registrace nešla dokončit (třída nebo jméno chybí)", cat: "ucet" },
  password_reset: { label: "Heslo obnoveno odkazem z e-mailu", cat: "ucet" },
  email_change: { label: "Změna e-mailu", cat: "ucet" },
  totp_enable: { label: "Zapnuto dvoufázové ověření", cat: "ucet" },
  totp_disable: { label: "Vypnuto dvoufázové ověření", cat: "ucet" },
  recovery_regenerate: { label: "Nové záložní kódy", cat: "ucet" },
  bakalari_connect: { label: "Propojení s Bakaláři", cat: "ucet" },
  account_delete: { label: "Smazání účtu", cat: "ucet" },
  // správa
  school_create: { label: "Škola přidána", cat: "sprava" },
  school_update: { label: "Škola upravena", cat: "sprava" },
  school_delete: { label: "Škola smazána", cat: "sprava" },
  school_mail: { label: "Školní e-mail změněn", cat: "sprava" },
  class_auto_move: { label: "Student přesunut do nové třídy podle Bakalářů", cat: "ucet" },
  school_any_class: { label: "Registrace tříd školy změněna", cat: "sprava" },
  school_microsoft: { label: "Microsoft 365 u školy změněn", cat: "sprava" },
  class_add: { label: "Třída přidána", cat: "sprava" },
  class_rename: { label: "Třída přejmenována", cat: "sprava" },
  class_delete: { label: "Třída smazána", cat: "sprava" },
  roster_set: { label: "Seznam studentů uložen", cat: "sprava" },
  user_rename: { label: "Uživatel přejmenován", cat: "sprava" },
  user_move: { label: "Uživatel přesunut do jiné třídy", cat: "sprava" },
  user_signout: { label: "Uživatel odhlášen všude", cat: "sprava" },
  user_totp_reset: { label: "Dvoufázové ověření uživatele zrušeno", cat: "sprava" },
  user_bakalari_disconnect: { label: "Bakaláři uživateli odpojeni", cat: "sprava" },
  sync_now: { label: "Spuštěna synchronizace Bakalářů", cat: "sprava" },
  user_socials_clear: { label: "Uživateli smazány kontakty", cat: "sprava" },
  user_password_set: { label: "Heslo uživatele nastaveno správcem", cat: "sprava" },
  admin_toggle: { label: "Změněna role správce", cat: "sprava" },
  ai_settings: { label: "Nastavení AI změněno", cat: "sprava" },
  announce: { label: "Oznámení odesláno", cat: "sprava" },
  announce_schedule: { label: "Oznámení naplánováno", cat: "sprava" },
  announce_cancel: { label: "Naplánované oznámení zrušeno", cat: "sprava" },
  module_change: { label: "Modul třídy zapnut nebo vypnut", cat: "sprava" },
  duty_change: { label: "Rozpis služeb změněn správcem", cat: "sprava" },
  stripe_set: { label: "Klíče Stripe změněny", cat: "sprava" },
  treasurer_set: { label: "Pokladník jmenován nebo odebrán", cat: "sprava" },
  // obsah ostatních lidí
  admin_content: { label: "Správce změnil nebo smazal cizí položku", cat: "obsah" },
  report: { label: "Nahlášení obsahu", cat: "obsah" },
} as const satisfies Record<string, { label: string; cat: AuditCategory }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "ucet", label: "Účty a přihlášení" },
  { id: "sprava", label: "Správa" },
  { id: "obsah", label: "Obsah a nahlášení" },
];

export type AuditRow = { id: number; at: number; actor_id: number | null; actor_name: string | null; action: string; target_user_id: number | null; target: string | null; detail: string | null; ip: string | null };

const clip = (v: string | null | undefined, n: number) => (v ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);

/** Kolik dní se záznamy drží (AUDIT_RETENTION_DAYS, výchozí 365, nejméně 30). */
export const retentionDays = () => {
  const n = Number(process.env.AUDIT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 365;
};

let lastPurge = 0;
function purgeOld() {
  const now = Date.now();
  if (now - lastPurge < 3600_000) return;
  lastPurge = now;
  run("DELETE FROM audit_log WHERE at < ?", now - retentionDays() * 86_400_000);
}

export type AuditOpts = {
  /** koho se událost týká (účet) */
  targetUser?: { id: number; name?: string | null } | number | null;
  /** čeho se týká, pokud to není účet (škola, třída, položka…) */
  target?: string | null;
  /** krátký popis; žádná hesla, tokeny ani obsah */
  detail?: string | null;
  /** IP adresa; když chybí, doplní se z aktuálního požadavku */
  ip?: string | null;
};

/**
 * Zapíše událost. Funguje synchronně a nikdy nevyhodí chybu. IP adresu přidá až po zápisu z hlaviček aktuálního požadavku (pokud nějaký je).
 */
export function audit(actor: { id: number; name: string } | null, action: AuditAction, o: AuditOpts = {}) {
  try {
    const tu = typeof o.targetUser === "number" ? { id: o.targetUser, name: null } : o.targetUser ?? null;
    const target = clip(o.target ?? tu?.name ?? null, 200);
    const r = run(
      "INSERT INTO audit_log (at, actor_id, actor_name, action, target_user_id, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      Date.now(), actor?.id ?? null, clip(actor?.name, 100), action, tu?.id ?? null, target, clip(o.detail, 500), clip(o.ip, 64),
    );
    if (o.ip === undefined) void attachIp(Number(r.lastInsertRowid));
    purgeOld();
  } catch (e) {
    console.error("audit failed", e instanceof Error ? e.message : e);
  }
}

async function attachIp(id: number) {
  try {
    const { clientIp } = await import("./session");
    const ip = await clientIp();
    if (ip && ip !== "unknown") run("UPDATE audit_log SET ip = ? WHERE id = ? AND ip IS NULL", clip(ip, 64), id);
  } catch {
    // mimo požadavek (úloha na pozadí) IP není, a to je v pořádku
  }
}

/** Při smazání účtu: zmizí jméno a IP z jeho záznamů i jméno tam, kde byl cílem. Samotné události (co se kdy stalo) zůstávají. */
export function forgetUser(userId: number) {
  try {
    run("UPDATE audit_log SET actor_name = '(smazaný účet)', ip = NULL WHERE actor_id = ?", userId);
    run("UPDATE audit_log SET target = '(smazaný účet)' WHERE target_user_id = ?", userId);
  } catch (e) {
    console.error("audit forget failed", e instanceof Error ? e.message : e);
  }
}

export type AuditFilter = { q?: string; cat?: AuditCategory | ""; action?: string; user?: number; before?: number };

/** Záznamy od nejnovějšího; `before` je id posledního řádku předchozí stránky. Vrací o jeden řádek víc, aby šlo poznat, že je další stránka. */
export function listAudit(f: AuditFilter = {}, limit = 50) {
  purgeOld();
  const where: string[] = [];
  const p: Record<string, unknown> = {};
  if (f.before) (where.push("id < :before"), (p.before = f.before));
  if (f.user) (where.push("(actor_id = :user OR target_user_id = :user)"), (p.user = f.user));
  if (f.action && f.action in AUDIT_ACTIONS) (where.push("action = :action"), (p.action = f.action));
  else if (f.cat) {
    const list = (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((a) => AUDIT_ACTIONS[a].cat === f.cat);
    if (list.length) where.push(`action IN (${list.map((a) => `'${a}'`).join(",")})`);
  }
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) (where.push("lower(COALESCE(actor_name,'') || ' ' || COALESCE(target,'') || ' ' || COALESCE(detail,'') || ' ' || COALESCE(ip,'')) LIKE '%' || :q || '%'"), (p.q = q));
  const rows = all<AuditRow>(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${Math.max(1, Math.min(200, limit)) + 1}`, p);
  const more = rows.length > limit;
  return { rows: more ? rows.slice(0, limit) : rows, more };
}

export const auditCount = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log")?.n ?? 0;

/** Název třídy se školou pro popis události. */
export const classTarget = (classId: number) => {
  const c = get<{ name: string; school: string }>("SELECT c.name, s.name AS school FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.id = ?", classId);
  return c ? `${c.school} · ${c.name}` : `třída ${classId}`;
};
