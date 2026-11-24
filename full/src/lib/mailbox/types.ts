export type Folder = "inbox" | "sent";

export type MailItem = { id: string; from: string; fromAddr: string; subject: string; date: number; unread: boolean; preview: string; attachments: boolean };
export type MailAttachment = { id: string; name: string; size: number };
export type MailFull = MailItem & { to: string; html: string | null; text: string; atts: MailAttachment[] };

/** Společné rozhraní pro Microsoft 365 (Graph) a obecný IMAP/SMTP. */
export interface Mailbox {
  list(folder: Folder, limit: number, offset: number): Promise<{ items: MailItem[]; more: boolean }>;
  get(folder: Folder, id: string): Promise<MailFull>;
  markRead(folder: Folder, id: string): Promise<void>;
  reply(folder: Folder, id: string, text: string): Promise<void>;
  send(to: string, subject: string, text: string): Promise<void>;
  attachment(folder: Folder, id: string, attId: string): Promise<{ name: string; type: string; data: Buffer }>;
}

export class MailError extends Error {
  constructor(message: string, public kind: "auth" | "network" | "config" | "api" = "api") {
    super(message);
  }
}
