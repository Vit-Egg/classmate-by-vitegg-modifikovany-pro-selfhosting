"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, loggedIn, needsSetup, rateOk, tokenOk } from "@/lib/auth";
import { BakalariError } from "@/lib/bakalari";
import { connect, disconnect, syncAll } from "@/lib/bk";
import { encrypt, hashPasswordAsync, verifyPasswordAsync } from "@/lib/crypto";
import { ME, run, setting, setSetting } from "@/lib/db";
import { rotateEmbedKey } from "@/lib/embed/core";
import { forgetStravaSession, StravaError, stravaLogin, stravaOrder, stravaPublicMenu } from "@/lib/strava";

/** Chyby i potvrzení se předávají v adrese (?e= / ?ok=), stránky fungují i bez JavaScriptu. */
const back = (path: string, kind: "e" | "ok", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function guard() {
  if (!(await loggedIn())) redirect("/prihlaseni");
}

export async function setupAction(fd: FormData) {
  if (!needsSetup()) redirect("/prihlaseni");
  if (!(await rateOk("setup", 10, 900))) back("/zprovozneni", "e", "Příliš mnoho pokusů, zkus to za chvíli.");
  if (!tokenOk(str(fd, "token"))) back("/zprovozneni", "e", "Instalační kód nesedí. Najdeš ho v logu serveru nebo v SETUP_TOKEN.");
  const pw = str(fd, "password");
  if (pw.length < 10) back("/zprovozneni", "e", "Heslo musí mít aspoň 10 znaků.");
  if (pw !== str(fd, "password2")) back("/zprovozneni", "e", "Hesla se neshodují.");
  setSetting("password_hash", await hashPasswordAsync(pw));
  await createSession();
  redirect("/nastaveni?ok=" + encodeURIComponent("Hotovo. Teď propoj Bakaláře."));
}

export async function loginAction(fd: FormData) {
  if (!(await rateOk("login", 10, 900))) back("/prihlaseni", "e", "Příliš mnoho pokusů, zkus to za chvíli.");
  const hash = setting("password_hash");
  if (!hash || !(await verifyPasswordAsync(str(fd, "password"), hash))) back("/prihlaseni", "e", "Nesprávné heslo.");
  await createSession();
  const next = str(fd, "next");
  redirect(/^\/(?![/\\])/.test(next) ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/prihlaseni");
}

export async function changePasswordAction(fd: FormData) {
  await guard();
  const hash = setting("password_hash")!;
  if (!(await verifyPasswordAsync(str(fd, "old"), hash))) back("/nastaveni", "e", "Současné heslo nesedí.");
  const pw = str(fd, "password");
  if (pw.length < 10) back("/nastaveni", "e", "Nové heslo musí mít aspoň 10 znaků.");
  setSetting("password_hash", await hashPasswordAsync(pw));
  run("DELETE FROM sessions");
  await createSession();
  back("/nastaveni", "ok", "Heslo je změněné, ostatní zařízení jsou odhlášená.");
}

export async function connectBakalariAction(fd: FormData) {
  await guard();
  if (!(await rateOk("bk", 8, 3600))) back("/nastaveni", "e", "Moc pokusů, zkus to za chvíli.");
  const url = str(fd, "url").trim();
  const user = str(fd, "user").trim();
  const pass = str(fd, "pass");
  if (!url || !user || !pass) back("/nastaveni", "e", "Vyplň adresu, jméno i heslo do Bakalářů.");
  try {
    await connect(url, user, pass);
  } catch (e) {
    if (e instanceof BakalariError) back("/nastaveni", "e", e.kind === "auth" ? "Jméno nebo heslo do Bakalářů nesedí." : e.message);
    throw e;
  }
  await syncAll(true).catch(() => {});
  revalidatePath("/", "layout");
  back("/nastaveni", "ok", "Bakaláři jsou propojení a data načtená.");
}

export async function disconnectBakalariAction() {
  await guard();
  disconnect();
  revalidatePath("/", "layout");
  back("/nastaveni", "ok", "Bakaláři jsou odpojení a jejich data smazaná.");
}

export async function syncAction(fd: FormData) {
  await guard();
  if (!(await rateOk("sync", 6, 600))) back(str(fd, "back") || "/", "e", "Načíst znovu jde nejvýš 6× za 10 minut (šetříme server školy).");
  await syncAll(true);
  revalidatePath("/", "layout");
  redirect(str(fd, "back") || "/");
}

export async function connectStravaAction(fd: FormData) {
  await guard();
  if (!(await rateOk("strava", 8, 3600))) back("/nastaveni", "e", "Moc pokusů, zkus to za chvíli.");
  const canteen = str(fd, "canteen").trim();
  const user = str(fd, "user").trim();
  const pass = str(fd, "pass");
  if (!/^\d{1,6}$/.test(canteen)) back("/nastaveni", "e", "Číslo jídelny jsou jen číslice (najdeš ho na strava.cz).");
  try {
    if (user) await stravaLogin(canteen, user, pass);
    else await stravaPublicMenu(canteen);
  } catch (e) {
    if (e instanceof StravaError) back("/nastaveni", "e", e.message);
    throw e;
  }
  run("INSERT OR REPLACE INTO strava_accounts (user_id, username, canteen, password_enc) VALUES (?, ?, ?, ?)", ME, user, canteen, user ? encrypt(pass) : "");
  forgetStravaSession(ME);
  back("/nastaveni", "ok", user ? "Strava.cz je propojená, můžeš objednávat." : "Jídelníček jídelny je propojený (bez objednávání).");
}

export async function disconnectStravaAction() {
  await guard();
  run("DELETE FROM strava_accounts WHERE user_id = ?", ME);
  forgetStravaSession(ME);
  back("/nastaveni", "ok", "Strava.cz je odpojená.");
}

export async function orderAction(fd: FormData) {
  await guard();
  try {
    await stravaOrder(ME, Number(str(fd, "id")), str(fd, "want") === "1", str(fd, "name"));
  } catch (e) {
    if (e instanceof StravaError) back("/obedy", "e", e.message);
    throw e;
  }
  revalidatePath("/obedy");
  back("/obedy", "ok", str(fd, "want") === "1" ? "Objednáno." : "Zrušeno.");
}

export async function rotateKeyAction() {
  await guard();
  rotateEmbedKey();
  back("/widgety", "ok", "Klíč je nový. Staré adresy widgetů, pluginu i kalendáře přestaly platit.");
}
