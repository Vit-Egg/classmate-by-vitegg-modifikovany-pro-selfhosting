/** Obecná pošta přes IMAP (čtení) a SMTP (odpovědi). Heslo je v databázi šifrované, spojení se otevírá na každý požadavek. */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { decrypt } from "../crypto";
import { get, run } from "../db";
import type { SchoolMail } from "./school";
import { MailError, type Folder, type MailFull, type MailItem, type Mailbox } from "./types";

type Node = { disposition?: string; childNodes?: Node[] };
const hasAttachment = (n?: Node): boolean => !!n && (n.disposition === "attachment" || !!n.childNodes?.some(hasAttachment));

export function imapMailbox(userId: number, cfg: SchoolMail): Mailbox {
  const acc = () => {
    const row = get<{ address: string; secret_enc: string }>("SELECT address, secret_enc FROM mail_accounts WHERE user_id = ? AND kind = 'imap'", userId);
    if (!row) throw new MailError("Školní e-mail není připojen.", "config");
    return { address: row.address, password: decrypt(row.secret_enc) };
  };

  async function withClient<T>(fn: (c: ImapFlow, address: string) => Promise<T>): Promise<T> {
    const { address, password } = acc();
    const port = cfg.imapPort ?? 993;
    const c = new ImapFlow({ host: cfg.imapHost!, port, secure: port !== 143, auth: { user: address, pass: password }, logger: false, socketTimeout: 30_000 });
    c.on("error", () => {});
    try {
      await c.connect();
    } catch (e) {
      throw new MailError((e as { authenticationFailed?: boolean }).authenticationFailed ? "Poštovní server odmítl přihlášení, zkontroluj heslo." : "Poštovní server teď není dostupný.", (e as { authenticationFailed?: boolean }).authenticationFailed ? "auth" : "network");
    }
    try {
      const r = await fn(c, address);
      run("UPDATE mail_accounts SET last_ok_at = ? WHERE user_id = ? AND kind = 'imap'", Date.now(), userId);
      return r;
    } catch (e) {
      if (e instanceof MailError) throw e;
      throw new MailError("Pošta vrátila chybu.", "api");
    } finally {
      await c.logout().catch(() => {});
    }
  }

  const path = async (c: ImapFlow, folder: Folder) => (folder === "inbox" ? "INBOX" : (await c.list()).find((b) => b.specialUse === "\\Sent")?.path ?? "Sent");

  return {
    list: (folder, limit, offset) =>
      withClient(async (c) => {
        const lock = await c.getMailboxLock(await path(c, folder));
        try {
          const total = c.mailbox ? c.mailbox.exists : 0;
          const hi = total - offset;
          if (hi < 1) return { items: [], more: false };
          const lo = Math.max(1, hi - limit + 1);
          const items: MailItem[] = [];
          for await (const m of c.fetch(`${lo}:${hi}`, { uid: true, envelope: true, flags: true, bodyStructure: true })) {
            const a = folder === "sent" ? m.envelope?.to?.[0] : m.envelope?.from?.[0];
            const f = m.envelope?.from?.[0];
            items.push({ id: String(m.uid), from: a?.name || a?.address || "", fromAddr: f?.address ?? "", subject: m.envelope?.subject || "(bez předmětu)", date: m.envelope?.date ? +new Date(m.envelope.date) : 0, unread: folder === "inbox" && !m.flags?.has("\\Seen"), preview: "", attachments: hasAttachment(m.bodyStructure as Node) });
          }
          items.sort((x, y) => y.date - x.date);
          return { items, more: lo > 1 };
        } finally {
          lock.release();
        }
      }),
    get: (folder, id) =>
      withClient(async (c) => {
        const lock = await c.getMailboxLock(await path(c, folder));
        try {
          const msg = await c.fetchOne(id, { source: true, flags: true, uid: true }, { uid: true });
          if (!msg || !msg.source) throw new MailError("Zpráva už neexistuje.", "api");
          const p = await simpleParser(msg.source);
          const from = p.from?.value?.[0];
          const to = Array.isArray(p.to) ? p.to.flatMap((x) => x.value) : p.to?.value ?? [];
          const atts = (p.attachments ?? []).filter((a) => a.contentDisposition === "attachment").map((a, i) => ({ id: String(i), name: a.filename ?? `priloha-${i + 1}`, size: a.size }));
          return {
            id, from: (folder === "sent" ? to[0]?.name || to[0]?.address : from?.name || from?.address) ?? "", fromAddr: from?.address ?? "", subject: p.subject || "(bez předmětu)", date: p.date ? +p.date : 0,
            unread: folder === "inbox" && !msg.flags?.has("\\Seen"), preview: "", attachments: atts.length > 0, to: to.map((t) => t.name || t.address).join(", "),
            html: typeof p.html === "string" ? p.html : null, text: p.text ?? "", atts,
          } satisfies MailFull;
        } finally {
          lock.release();
        }
      }),
    markRead: (folder, id) =>
      withClient(async (c) => {
        const lock = await c.getMailboxLock(await path(c, folder));
        try {
          await c.messageFlagsAdd(id, ["\\Seen"], { uid: true });
        } finally {
          lock.release();
        }
      }),
    async reply(folder, id, text) {
      const { address, password } = acc();
      const orig = await withClient(async (c) => {
        const lock = await c.getMailboxLock(await path(c, folder));
        try {
          const msg = await c.fetchOne(id, { source: true }, { uid: true });
          if (!msg || !msg.source) throw new MailError("Zpráva už neexistuje.", "api");
          return simpleParser(msg.source);
        } finally {
          lock.release();
        }
      });
      const port = cfg.smtpPort ?? 587;
      const tr = nodemailer.createTransport({ host: cfg.smtpHost!, port, secure: port === 465, auth: { user: address, pass: password }, connectionTimeout: 15_000 });
      const subject = /^re:/i.test(orig.subject ?? "") ? orig.subject! : `Re: ${orig.subject ?? ""}`;
      const quoted = (orig.text ?? "").split("\n").map((l) => `> ${l}`).join("\n");
      try {
        await tr.sendMail({
          from: address, to: orig.replyTo?.value?.[0]?.address ?? orig.from?.value?.[0]?.address, subject,
          text: `${text}\n\n${orig.from?.text ?? ""} napsal(a):\n${quoted}`, inReplyTo: orig.messageId, references: [...(Array.isArray(orig.references) ? orig.references : orig.references ? [orig.references] : []), orig.messageId].filter(Boolean) as string[],
        });
      } catch {
        throw new MailError("Odpověď se nepodařilo odeslat.", "api");
      }
    },
    async send(to, subject, text) {
      const { address, password } = acc();
      const port = cfg.smtpPort ?? 587;
      const tr = nodemailer.createTransport({ host: cfg.smtpHost!, port, secure: port === 465, auth: { user: address, pass: password }, connectionTimeout: 15_000 });
      try {
        await tr.sendMail({ from: address, to, subject, text });
      } catch {
        throw new MailError("Zprávu se nepodařilo odeslat.", "api");
      }
    },
    attachment: (folder, id, attId) =>
      withClient(async (c) => {
        const lock = await c.getMailboxLock(await path(c, folder));
        try {
          const msg = await c.fetchOne(id, { source: true }, { uid: true });
          if (!msg || !msg.source) throw new MailError("Zpráva už neexistuje.", "api");
          const a = (await simpleParser(msg.source)).attachments.filter((x) => x.contentDisposition === "attachment")[Number(attId)];
          if (!a) throw new MailError("Příloha neexistuje.", "api");
          return { name: a.filename ?? "priloha", type: a.contentType || "application/octet-stream", data: a.content };
        } finally {
          lock.release();
        }
      }),
  };
}
