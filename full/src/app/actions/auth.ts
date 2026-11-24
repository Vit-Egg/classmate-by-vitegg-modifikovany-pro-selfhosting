"use server";

import { audit } from "@/lib/audit";
import { operator } from "@/lib/instance";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { get, run, rateLimit } from "@/lib/db";
import { encrypt, hashPassword, hashPasswordAsync, randomToken, sha256, verifyPasswordAsync } from "@/lib/crypto";
import { clientIp, createSession, destroySession, getCurrentUser, USER_SELECT, type User } from "@/lib/session";
import { verifySecondFactor } from "@/lib/twofa";
import { BakalariError, bkGet, bkLogin } from "@/lib/bakalari";
import { bakalariName, matchRoster, memberNamed, rosterOf } from "@/lib/roster";
import { rememberTokens, syncAll } from "@/lib/sync";
import { sendConfirmation } from "@/lib/email-notify";
import { mailConfigured } from "@/lib/mail";
import { passwordProblem } from "@/lib/password-policy";
import type { ActionState } from "@/lib/action";

const userName = (id: number) => get<{ name: string }>("SELECT name FROM users WHERE id = ?", id)?.name ?? null;

const contact = () => (operator().email ? ` Napiš na ${operator().email}.` : "");
const schoolName = (id: number) => get<{ name: string }>("SELECT name FROM schools WHERE id = ?", id)?.name ?? `škola ${id}`;

const CHALLENGE = "chal";
const AFTER = "after";

/** Po přihlášení smíme přesměrovat jen na cestu uvnitř aplikace. */
const safeNext = (v: unknown) => (typeof v === "string" && /^\/(?![/\\])/.test(v) ? v : null);
// Limity podle IP jsou štědré, protože celá škola sdílí jednu veřejnou adresu (NAT). Útoku na konkrétní účet brání limity podle e-mailu a jména v Bakalářích.
const TOO_MANY = "Příliš mnoho pokusů. Zkus to za chvíli.";
const BAD_LOGIN = "Nesprávný e-mail nebo heslo.";
let dummyHash: string | null = null;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Vyplň e-mail a heslo." };
  if (!rateLimit(`login:ip:${await clientIp()}`, 600, 900) || !rateLimit(`login:email:${email}`, 8, 900)) return { error: TOO_MANY };

  const user = get<{ id: number; name: string; password_hash: string; totp_enabled: number }>("SELECT id, name, password_hash, totp_enabled FROM users WHERE email = ?", email);
  // Ověření proti falešnému hashi, aby odpověď nešlo časově rozlišit.
  const valid = await verifyPasswordAsync(password, user?.password_hash ?? (dummyHash ??= hashPassword("dummy")));
  if (!user || !valid) {
    // e-mail se nezapisuje (u neznámého účtu by šlo o cizí osobní údaj), u existujícího účtu se zapíše, komu se někdo snažil přihlásit
    audit(null, "login_failed", user ? { targetUser: { id: user.id, name: user.name } } : { detail: "neznámý e-mail" });
    return { error: BAD_LOGIN };
  }

  if (user.totp_enabled) {
    const token = randomToken(24);
    run("DELETE FROM login_challenges WHERE expires_at < ?", Date.now());
    run("INSERT INTO login_challenges (id, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), user.id, Date.now() + 5 * 60_000);
    const next = safeNext(fd.get("next"));
    if (next) (await cookies()).set(AFTER, next, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300, secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production" });
    (await cookies()).set(CHALLENGE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300, secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production" });
    redirect("/prihlaseni/overeni");
  }
  await createSession(user.id);
  audit({ id: user.id, name: user.name }, "login");
  redirect(safeNext(fd.get("next")) ?? "/dnes");
}

export async function verifyLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE)?.value;
  const row = token ? get<{ user_id: number; expires_at: number; attempts: number }>("SELECT user_id, expires_at, attempts FROM login_challenges WHERE id = ?", sha256(token)) : undefined;
  if (!token || !row || row.expires_at < Date.now()) redirect("/prihlaseni");
  if (row.attempts >= 5) {
    run("DELETE FROM login_challenges WHERE id = ?", sha256(token));
    return { error: "Příliš mnoho nesprávných kódů. Přihlas se znovu." };
  }
  run("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?", sha256(token));
  // celkově omezit hádání kódu na jeden účet, i kdyby si útočník (se znalostí hesla) vyžádal víc výzev
  if (!rateLimit(`2fa:user:${row.user_id}`, 15, 3600)) return { error: TOO_MANY };
  if (!verifySecondFactor(row.user_id, String(fd.get("code") ?? ""))) {
    audit(null, "login_2fa_failed", { targetUser: { id: row.user_id, name: userName(row.user_id) } });
    return { error: "Kód nesedí. Zkus to znovu." };
  }
  run("DELETE FROM login_challenges WHERE id = ?", sha256(token));
  jar.delete(CHALLENGE);
  const after = safeNext(jar.get(AFTER)?.value);
  jar.delete(AFTER);
  await createSession(row.user_id);
  audit({ id: row.user_id, name: userName(row.user_id) ?? "" }, "login", { detail: "s dvoufázovým ověřením" });
  redirect(after ?? "/dnes");
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Zadej platný e-mail.")),
  password: z.string().max(200, "Heslo je moc dlouhé."),
  school: z.coerce.number().int(),
  bkUser: z.string().trim().min(1, "Zadej jméno do Bakalářů.").max(100),
  bkPass: z.string().min(1, "Zadej heslo do Bakalářů.").max(200),
  accept: z.literal("1", { error: "Potvrď, že ti je aspoň 13 let a že souhlasíš s pravidly používání." }),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
    school: fd.get("school"),
    bkUser: fd.get("bkUser"),
    bkPass: fd.get("bkPass"),
    accept: fd.get("accept"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const weak = passwordProblem(v.password, v.email, v.bkUser);
  if (weak) return { error: weak };
  if (!rateLimit(`register:ip:${await clientIp()}`, 200, 3600)) return { error: TOO_MANY };

  const school = get<{ id: number; bakalari_url: string | null; any_class: number }>("SELECT id, bakalari_url, any_class FROM schools WHERE id = ?", v.school);
  if (!school) return { error: "Vybraná škola neexistuje." };
  if (!school.bakalari_url) return { error: "Tato škola zatím nemá nastavené Bakaláře." };
  // registrace nesmí posloužit k hádání cizího hesla do Bakalářů: pokusy se omezují i podle uživatelského jména
  if (!rateLimit(`register:bk:${school.id}:${v.bkUser.toLowerCase()}`, 5, 3600)) return { error: TOO_MANY };
  let tokens;
  let classAbbrev: string | undefined;
  let fullName = "";
  try {
    tokens = await bkLogin(school.bakalari_url, v.bkUser, v.bkPass);
    const me = await bkGet<{ Class?: { Abbrev?: string }; FullName?: string }>(school.bakalari_url, tokens.access_token, "/api/3/user");
    classAbbrev = me.Class?.Abbrev;
    fullName = (me.FullName ?? "").trim();
  } catch (e) {
    if (e instanceof BakalariError) return { error: e.kind === "auth" ? "Jméno nebo heslo do Bakalářů nesedí." : e.message };
    throw e;
  }

  // Že e-mail nebo účet z Bakalářů už existuje, se prozradí až po úspěšném přihlášení do Bakalářů: kdo nezná heslo, nemůže zjišťovat, kdo tu má účet.
  if (get("SELECT 1 FROM users WHERE email = ?", v.email)) return { error: "Účet s tímto e-mailem už existuje." };
  if (get("SELECT 1 FROM users WHERE school_id = ? AND bakalari_username = ?", school.id, v.bkUser)) return { error: "Tento účet z Bakalářů už je v aplikaci zaregistrovaný." };

  // Třídu i jméno bereme z Bakalářů, nikdo si je nevybírá. Třída musí být mezi těmi, které správce ve škole povolil (založil),
  // nebo ji škola povolila všechny: pak se nová třída při první registraci sama založí.
  const abbrev = classAbbrev?.replace(/\s+/g, " ").trim();
  if (!abbrev) return { error: "Z Bakalářů se nepodařilo zjistit tvou třídu." };
  let classId = get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND lower(replace(name, ' ', '')) = ?", school.id, abbrev.replace(/\s+/g, "").toLowerCase())?.id;
  if (!classId) {
    if (!school.any_class) {
      // správce uvidí v audit logu, kolik lidí a z jaké třídy se snaží registrovat, a může ji povolit
      audit(null, "register_blocked", { target: `${schoolName(school.id)} · ${abbrev}`, detail: "třída není mezi povolenými" });
      return { error: `Třída ${abbrev} zatím není mezi povolenými třídami školy. Požádej správce, ať ji povolí.${contact()}` };
    }
    run("INSERT OR IGNORE INTO classes (school_id, name) VALUES (?, ?)", school.id, abbrev.slice(0, 40));
    classId = get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND lower(replace(name, ' ', '')) = ?", school.id, abbrev.replace(/\s+/g, "").toLowerCase())?.id;
    if (!classId) return { error: "Třídu se nepodařilo založit, zkus to znovu." };
    audit(null, "class_add", { target: `${schoolName(school.id)} · ${abbrev}`, detail: "založena při registraci studenta (škola povoluje všechny třídy)" });
  }

  // do třídy se dostane jen člověk ze seznamu studentů; jméno bereme z Bakalářů, ne z formuláře, aby si nikdo nemohl vybrat cizí
  if (!fullName) return { error: "Z Bakalářů se nepodařilo zjistit tvoje jméno, kontaktuj správce." };
  // třída s prázdným seznamem přijímá všechny studenty z Bakalářů té třídy (jméno se vezme z Bakalářů); jakmile správce seznam vyplní, platí jen on
  const open = rosterOf(classId).length === 0;
  const m = open ? ({ kind: "ok", name: bakalariName(fullName) } as const) : matchRoster(classId, fullName);
  if (m.kind === "none") audit(null, "register_blocked", { target: `${schoolName(school.id)} · ${classAbbrev ?? ""}`, detail: `jméno z Bakalářů „${fullName}“ není v seznamu třídy` });
  if (m.kind === "none") return { error: `Jméno z Bakalářů („${fullName}“) není v seznamu studentů třídy ${classAbbrev ?? ""}. Požádej správce, ať tě tam přidá.${contact()}` };
  if (m.kind === "ambiguous") return { error: `Jméno „${fullName}“ v seznamu studentů sedí na víc lidí, kontaktuj správce.${contact()}` };
  // Seznam třídy slouží jen k tomu, aby se člověk mohl zaregistrovat. Jméno, které se pak ukazuje, je vždy z Bakalářů (ve správné podobě).
  const shown = open ? m.name : bakalariName(fullName);
  const holder = memberNamed(classId, m.name, shown);
  if (holder && !holder.placeholder) return { error: `${shown} už v aplikaci je zaregistrovaný. Jsi to ty? Přihlas se, nebo kontaktuj správce.${contact()}` };

  // člen bez účtu ze seznamu se přepíše na skutečný účet (zůstanou mu platby i služby), jinak vznikne nový
  const passwordHash = await hashPasswordAsync(v.password);
  let id: number;
  if (holder) {
    id = holder.id;
    run("UPDATE users SET email = ?, name = ?, password_hash = ?, bakalari_username = ?, bakalari_refresh_enc = ?, placeholder = 0, created_at = ? WHERE id = ? AND placeholder = 1", v.email, shown, passwordHash, v.bkUser, encrypt(tokens.refresh_token), Date.now(), id);
  } else {
    id = Number(
      run(
        `INSERT INTO users (email, name, password_hash, role, school_id, class_id, bakalari_username, bakalari_refresh_enc, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v.email, shown, passwordHash, "user", school.id, classId, v.bkUser, encrypt(tokens.refresh_token), Date.now(),
      ).lastInsertRowid,
    );
  }
  rememberTokens(id, tokens.access_token, tokens.expires_in);
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, id)!;
  // první načtení dat se čeká nejvýš 10 s (při náporu na školu může trvat dlouho); dokončí se samo na pozadí a stránky ho dočtou z cache
  await Promise.race([syncAll(user, true).catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);
  // když server umí posílat poštu, nový účet musí potvrdit e-mail, než aplikaci použije
  if (mailConfigured()) {
    run("UPDATE users SET email_gate = 1 WHERE id = ?", id);
    void sendConfirmation({ id, email: v.email, name: shown }).catch((e) => console.error("registration confirmation failed", e));
  }
  await createSession(id);
  audit({ id, name: shown }, "register", { detail: holder ? "převzal účet ze seznamu třídy" : undefined });
  redirect(safeNext(fd.get("next")) ?? "/dnes");
}

export async function logoutAction() {
  const me = await getCurrentUser();
  if (me) audit({ id: me.id, name: me.name }, "logout");
  await destroySession();
  redirect("/prihlaseni");
}
