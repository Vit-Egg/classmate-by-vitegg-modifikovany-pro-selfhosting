"use server";

import { revalidatePath } from "next/cache";
import { demoBlocked } from "@/lib/demo-guard";
import { z } from "zod";
import type { ActionState } from "@/lib/action";
import { encrypt } from "@/lib/crypto";
import { rateLimit, run } from "@/lib/db";
import { MailError, inDomain, mailbox, schoolMail, type Folder } from "@/lib/mailbox";
import { forgetMsToken } from "@/lib/mailbox/graph";
import { requireUser } from "@/lib/session";
import { postChannel, sendChatMessage } from "@/lib/teams";
import { BakalariError } from "@/lib/bakalari";
import { komensSend } from "@/lib/komens";

const fail = (e: unknown): ActionState => {
  if (e instanceof MailError) return { error: e.message };
  console.error("mail action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};
const folder = (v: unknown): Folder => (v === "sent" ? "sent" : "inbox");

/** Připojení obecné pošty (IMAP) adresou a heslem. Údaje se ověří přihlášením a uloží se šifrovaně. */
export async function connectImapMail(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  const cfg = schoolMail(user.school_id);
  if (!cfg || cfg.kind !== "imap") return { error: "Tvoje škola tohle připojení nemá nastavené." };
  if (!rateLimit(`mailconnect:${user.id}`, 8, 3600)) return { error: "Moc pokusů, zkus to za chvíli." };
  const address = String(fd.get("address") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!z.string().email().safeParse(address).success) return { error: "Napiš celou školní e-mailovou adresu." };
  if (!inDomain(address, cfg.domain)) return { error: `Adresa musí končit @${cfg.domain}.` };
  if (!password) return { error: "Napiš heslo k e-mailu." };
  run("INSERT OR REPLACE INTO mail_accounts (user_id, kind, address, secret_enc, created_at) VALUES (?, 'imap', ?, ?, ?)", user.id, address, encrypt(password), Date.now());
  try {
    await mailbox(user).list("inbox", 1, 0); // ověření přihlášení
  } catch (e) {
    run("DELETE FROM mail_accounts WHERE user_id = ? AND kind = 'imap'", user.id);
    return fail(e);
  }
  revalidatePath("/komunikace");
  revalidatePath("/nastaveni");
  return { ok: true };
}

/** Odpojí propojený účet (kind = microsoft | imap). */
export async function disconnectAccount(fd: FormData) {
  const user = await requireUser();
  if (user.demo) return;
  const kind = fd.get("kind") === "microsoft" ? "microsoft" : "imap";
  run("DELETE FROM mail_accounts WHERE user_id = ? AND kind = ?", user.id, kind);
  if (kind === "microsoft") forgetMsToken(user.id);
  revalidatePath("/komunikace");
  revalidatePath("/nastaveni");
}

const Reply = z.object({ text: z.string().trim().min(1, "Napiš text odpovědi.").max(20_000, "Odpověď je moc dlouhá.") });

export async function replyMail(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  const v = Reply.safeParse({ text: fd.get("text") });
  if (!v.success) return { error: v.error.issues[0].message };
  if (!rateLimit(`mailsend:${user.id}`, 20, 3600)) return { error: "Poslal jsi dnes hodně zpráv, zkus to za chvíli." };
  try {
    await mailbox(user).reply(folder(fd.get("folder")), String(fd.get("id")), v.data.text);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/komunikace");
  return { ok: true, message: "Odpověď odeslána." };
}

const Mail = z.object({
  to: z.string().trim().min(3, "Napiš příjemce.").max(500).refine((s) => s.split(/[;,\s]+/).filter(Boolean).every((a) => z.string().email().safeParse(a).success) && s.split(/[;,\s]+/).filter(Boolean).length <= 5, "Příjemce jsou nejvýš 5 platných adres."),
  subject: z.string().trim().min(1, "Napiš předmět.").max(300, "Předmět je moc dlouhý."),
  text: z.string().trim().min(1, "Napiš text zprávy.").max(20_000, "Zpráva je moc dlouhá."),
});

const KomensMsg = z.object({
  type: z.string().min(1, "Vyber typ zprávy.").max(40),
  group: z.string().min(1, "Vyber, komu zprávu poslat.").max(40),
  recipients: z.array(z.string().min(1).max(80)).max(200),
  title: z.string().trim().max(300, "Předmět je moc dlouhý."),
  text: z.string().trim().min(1, "Napiš text zprávy.").max(20_000, "Zpráva je moc dlouhá."),
});

/**
 * Jedno odesílání pro celou Komunikaci: pole `channel` určuje kanál (komens | posta | teams), ostatní pole podle něj.
 * Komens: type, group, recipient (opakovaně), title, text, confirm, email, previous. E-mail: to, subject, text.
 * Teams: target (chat | channel), chat, team, channel, text.
 */
export async function sendMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  const channel = String(fd.get("channel") ?? "");
  const id = (k: string) => String(fd.get(k) ?? "");
  try {
    if (channel === "komens") {
      if (!user.bakalari_refresh_enc) return { error: "Bakaláři nejsou propojené." };
      const v = KomensMsg.safeParse({ type: id("type"), group: id("group"), recipients: fd.getAll("recipient").map(String), title: id("title"), text: id("text") });
      if (!v.success) return { error: v.error.issues[0].message };
      if (!rateLimit(`komenssend:${user.id}`, 20, 3600)) return { error: "Poslal jsi hodně zpráv, zkus to za chvíli." };
      await komensSend(user, { ...v.data, confirm: fd.get("confirm") === "on", email: fd.get("email") === "on", previousId: id("previous") || undefined });
      revalidatePath("/komunikace");
      return { ok: true, message: "Zpráva odeslána v Komens." };
    }
    if (channel === "posta") {
      const v = Mail.safeParse({ to: id("to"), subject: id("subject"), text: id("text") });
      if (!v.success) return { error: v.error.issues[0].message };
      if (!rateLimit(`mailsend:${user.id}`, 20, 3600)) return { error: "Poslal jsi dnes hodně zpráv, zkus to za chvíli." };
      await mailbox(user).send(v.data.to.split(/[;,\s]+/).filter(Boolean).join(", "), v.data.subject, v.data.text);
      revalidatePath("/komunikace");
      return { ok: true, message: "E-mail odeslán." };
    }
    if (channel === "teams") {
      const v = TeamsText.safeParse(fd.get("text"));
      if (!v.success) return { error: v.error.issues[0].message };
      if (!rateLimit(`teamssend:${user.id}`, 40, 3600)) return { error: "Poslal jsi hodně zpráv, zkus to za chvíli." };
      if (id("target") === "chat") {
        if (!id("chat")) return { error: "Vyber chat." };
        await sendChatMessage(user.id, id("chat"), v.data);
      } else {
        if (!id("team") || !id("channel_id")) return { error: "Vyber tým a kanál." };
        await postChannel(user.id, id("team"), id("channel_id"), v.data);
      }
      revalidatePath("/komunikace");
      return { ok: true, message: "Zpráva odeslána v Teams." };
    }
    return { error: "Vyber, přes co zprávu poslat." };
  } catch (e) {
    if (e instanceof BakalariError) return { error: e.message };
    if (e instanceof Error && !(e instanceof MailError)) {
      // Chyby z ověření v Komens mají srozumitelný text, ostatní se jen zalogují.
      if (channel === "komens") return { error: e.message };
    }
    return fail(e);
  }
}

const TeamsText = z.string().trim().min(1, "Napiš text zprávy.").max(10_000, "Zpráva je moc dlouhá.");

/** Odeslání v Teams: zpráva do chatu (kind=chat), nový příspěvek v kanálu (post) nebo odpověď na příspěvek (reply). */
export async function teamsSend(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  const v = TeamsText.safeParse(fd.get("text"));
  if (!v.success) return { error: v.error.issues[0].message };
  if (!rateLimit(`teamssend:${user.id}`, 40, 3600)) return { error: "Poslal jsi hodně zpráv, zkus to za chvíli." };
  const id = (k: string) => String(fd.get(k) ?? "");
  try {
    if (fd.get("kind") === "chat") await sendChatMessage(user.id, id("chat"), v.data);
    else await postChannel(user.id, id("team"), id("channel"), v.data, fd.get("kind") === "reply" ? id("message") : undefined);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/komunikace");
  return { ok: true };
}
