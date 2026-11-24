/** Obnovení zapomenutého hesla e-mailem. Odkaz je podepsaný, platí hodinu a po změně hesla přestane platit. */
import { audit } from "./audit";
import { get, run, rateLimit } from "./db";
import { hashPasswordAsync } from "./crypto";
import { hmac } from "./crypto";
import { layout } from "./email-notify";
import { mailConfigured, sendMail } from "./mail";
import { signToken, verifyToken } from "./mail-tokens";
import { siteUrl } from "./site";
import { passwordProblem } from "./password-policy";

type Row = { id: number; email: string; name: string; password_hash: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fingerprint = (hash: string) => hmac(`pw:${hash}`).slice(0, 16);

/** Pošle odkaz na obnovení, pokud účet existuje. Navenek se nikdy neprozradí, jestli ano (jinak by šlo zjišťovat, kdo tu má účet). */
export async function requestReset(rawEmail: string, ip: string): Promise<string | null> {
  if (!mailConfigured()) return "Obnovení hesla e-mailem zatím není na serveru zapnuté. Napiš správci, ať ti heslo nastaví.";
  const email = rawEmail.trim().toLowerCase();
  if (!/\S+@\S+\.\S+/.test(email)) return "Zadej platný e-mail.";
  if (!rateLimit(`reset:ip:${ip}`, 60, 3600) || !rateLimit(`reset:email:${email}`, 3, 3600)) return "Příliš mnoho pokusů. Zkus to za chvíli.";
  const u = get<Row>("SELECT id, email, name, password_hash FROM users WHERE email = ?", email);
  if (!u) return null;
  const url = `${siteUrl()}/obnovit-heslo?t=${signToken({ p: "reset", u: u.id, h: fingerprint(u.password_hash) }, 3600_000)}`;
  const inner = `<p style="margin:0 0 6px;font-size:15.5px;line-height:1.5">Ahoj ${esc(u.name.split(" ")[0])}, někdo (doufáme, že ty) požádal o obnovení hesla k Classmate.</p>
<a href="${url}" style="display:inline-block;margin-top:14px;background:#15181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Nastavit nové heslo</a>
<p style="color:#6b6f76;font-size:13.5px;margin:18px 0 0">Odkaz platí hodinu a jde použít jednou. Pokud jsi o nic nežádal(a), e-mail ignoruj, tvoje heslo zůstává stejné.</p>`;
  try {
    await sendMail({
      to: u.email,
      subject: "Classmate: obnovení hesla",
      text: `Ahoj, někdo požádal o obnovení hesla k Classmate. Nové heslo nastavíš tady (odkaz platí hodinu):\n${url}\n\nPokud jsi o nic nežádal(a), e-mail ignoruj, heslo zůstává stejné.`,
      html: layout("Obnovení hesla", inner, "Tenhle e-mail jsme poslali, protože někdo zadal tvoji adresu na stránce Zapomenuté heslo.", null),
    });
  } catch (e) {
    console.error("reset mail failed", e);
  }
  return null;
}

/** Je odkaz pořád platný? (podpis, čas a to, že se heslo od vydání odkazu nezměnilo) */
export function resetTokenUser(token: string): Row | null {
  const p = verifyToken(token, "reset");
  if (!p) return null;
  const u = get<Row>("SELECT id, email, name, password_hash FROM users WHERE id = ?", p.u);
  return u && p.h === fingerprint(u.password_hash) ? u : null;
}

/** Nastaví nové heslo, odhlásí všechna zařízení a odebere přístup připojeným AI aplikacím. 2FA zůstává v platnosti. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
  const u = resetTokenUser(token);
  if (!u) return "Odkaz je neplatný, vypršel, nebo už byl použit. Požádej o nový.";
  const weak = passwordProblem(password, u.email, u.name);
  if (weak) return weak;
  run("UPDATE users SET password_hash = ?, email_confirmed_for = ? WHERE id = ?", await hashPasswordAsync(password), u.email, u.id); // kdo přečetl e-mail, adresu potvrdil
  run("DELETE FROM sessions WHERE user_id = ?", u.id);
  run("DELETE FROM oauth_tokens WHERE user_id = ?", u.id);
  run("DELETE FROM app_devices WHERE user_id = ?", u.id);
  audit({ id: u.id, name: u.name }, "password_reset", { detail: "všechna zařízení odhlášena" });
  try {
    await sendMail({
      to: u.email,
      subject: "Classmate: heslo bylo změněno",
      text: "Heslo k Classmate bylo právě změněno a všechna zařízení byla odhlášena. Pokud jsi to nebyl(a) ty, napiš správci.",
      html: layout("Heslo bylo změněno", `<p style="margin:0;font-size:15.5px;line-height:1.5">Heslo k Classmate bylo právě změněno a všechna zařízení byla odhlášena. Pokud jsi to nebyl(a) ty, napiš prosím správci.</p>`, "Bezpečnostní upozornění.", { label: "Přihlásit se", url: `${siteUrl()}/prihlaseni` }),
    });
  } catch (e) {
    console.error("password changed mail failed", e);
  }
  return null;
}
