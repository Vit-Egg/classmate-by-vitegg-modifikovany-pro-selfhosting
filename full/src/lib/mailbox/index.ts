import { get } from "../db";
import type { User } from "../session";
import { graphMailbox } from "./graph";
import { imapMailbox } from "./imap";
import { schoolMail } from "./school";
import { MailError, type Mailbox } from "./types";

export type { Folder, MailFull, MailItem, Mailbox } from "./types";
export { MailError } from "./types";
export { schoolMail, schoolMicrosoft, inDomain, microsoftConfigured, MAIL_ERRORS } from "./school";

/** Propojený účet daného druhu (Microsoft a IMAP mohou být propojené zároveň). */
export const mailAccount = (userId: number, kind: "microsoft" | "imap") => get<{ kind: string; address: string; last_ok_at: number | null }>("SELECT kind, address, last_ok_at FROM mail_accounts WHERE user_id = ? AND kind = ?", userId, kind);

/** Schránka přihlášeného uživatele podle toho, jak je pošta nastavená u jeho školy. */
export function mailbox(user: User): Mailbox {
  const cfg = schoolMail(user.school_id);
  const acc = cfg && mailAccount(user.id, cfg.kind);
  if (!acc || !cfg) throw new MailError("Školní e-mail není připojen.", "config");
  return acc.kind === "microsoft" ? graphMailbox(user.id) : imapMailbox(user.id, cfg);
}
