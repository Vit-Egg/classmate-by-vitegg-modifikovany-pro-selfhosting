/** Microsoft 365 / Outlook přes Microsoft Graph (přihlášení účtem školy, oprávnění delegovaná uživatelem). */
import { decrypt, encrypt } from "../crypto";
import { get, run } from "../db";
import { MailError, type Folder, type MailFull, type MailItem, type Mailbox } from "./types";

/** Jediná sada oprávnění pro celý Microsoft účet (pošta, kalendář se schůzkami Teams, zadání, chaty, týmy, kanály a soubory v Teams), aby školní správce schvaloval jen jednou. */
const SCOPE = "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.Read EduAssignments.Read EduRoster.ReadBasic Chat.Read ChatMessage.Send Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Files.Read.All";
const TOKEN_URL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";

export const msScope = SCOPE;
export const msAuthUrl = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

const tokens = new Map<number, { token: string; exp: number }>();
export const forgetMsToken = (userId: number) => void tokens.delete(userId);

export async function msTokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!.trim(), client_secret: process.env.MS_CLIENT_SECRET!.trim(), ...params }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new MailError("Microsoft teď není dostupný.", "network");
  });
  const j = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !j?.access_token) {
    throw new MailError(j?.error === "invalid_grant" ? "Přihlášení k e-mailu vypršelo, připoj ho znovu." : "Přihlášení k Microsoftu se nezdařilo.", j?.error === "invalid_grant" ? "auth" : "api");
  }
  return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in ?? 3600 };
}

export async function accessToken(userId: number) {
  const c = tokens.get(userId);
  if (c && c.exp > Date.now()) return c.token;
  const row = get<{ secret_enc: string }>("SELECT secret_enc FROM mail_accounts WHERE user_id = ? AND kind = 'microsoft'", userId);
  if (!row) throw new MailError("Školní e-mail není připojen.", "config");
  try {
    const t = await msTokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(row.secret_enc) });
    if (t.refresh) run("UPDATE mail_accounts SET secret_enc = ?, last_ok_at = ? WHERE user_id = ? AND kind = 'microsoft'", encrypt(t.refresh), Date.now(), userId);
    tokens.set(userId, { token: t.access, exp: Date.now() + (t.expiresIn - 120) * 1000 });
    return t.access;
  } catch (e) {
    if (e instanceof MailError && e.kind === "auth") tokens.delete(userId);
    throw e;
  }
}

export async function graphFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(GRAPH + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => {
    throw new MailError("Pošta teď není dostupná.", "network");
  });
  if (res.status === 401) throw new MailError("Přihlášení k Microsoftu vypršelo, připoj účet znovu.", "auth");
  if (res.status === 403) throw new MailError("Microsoft odmítl přístup (chybí oprávnění nebo souhlas správce školy). Zkus účet odpojit a připojit znovu.", "auth");
  if (!res.ok) throw new MailError(`Microsoft vrátil chybu ${res.status}.`, "api");
  return res;
}

type GMsg = {
  id: string; subject?: string; receivedDateTime?: string; sentDateTime?: string; isRead?: boolean; bodyPreview?: string; hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  body?: { contentType?: string; content?: string };
};
const who = (a?: { name?: string; address?: string }) => ({ name: a?.name || a?.address || "", addr: a?.address ?? "" });
const FOLDER: Record<Folder, string> = { inbox: "inbox", sent: "sentitems" };

const item = (m: GMsg, folder: Folder): MailItem => {
  const f = who(m.from?.emailAddress);
  return { id: m.id, from: folder === "sent" ? who(m.toRecipients?.[0]?.emailAddress).name : f.name, fromAddr: f.addr, subject: m.subject || "(bez předmětu)", date: Date.parse((folder === "sent" ? m.sentDateTime : m.receivedDateTime) ?? "") || 0, unread: folder === "inbox" && m.isRead === false, preview: m.bodyPreview ?? "", attachments: !!m.hasAttachments };
};

export function graphMailbox(userId: number): Mailbox {
  const t = () => accessToken(userId);
  const mid = (id: string) => encodeURIComponent(id);
  return {
    async list(folder, limit, offset) {
      const q = new URLSearchParams({ $top: String(limit + 1), $skip: String(offset), $orderby: folder === "sent" ? "sentDateTime desc" : "receivedDateTime desc", $select: "id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments" });
      const j = (await (await graphFetch(await t(), `/me/mailFolders/${FOLDER[folder]}/messages?${q}`)).json()) as { value: GMsg[] };
      return { items: j.value.slice(0, limit).map((m) => item(m, folder)), more: j.value.length > limit };
    },
    async get(folder, id) {
      const token = await t();
      const m = (await (await graphFetch(token, `/me/messages/${mid(id)}?$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments,body`, { headers: { Prefer: 'outlook.body-content-type="html"' } })).json()) as GMsg;
      let atts: MailFull["atts"] = [];
      if (m.hasAttachments) {
        const a = (await (await graphFetch(token, `/me/messages/${mid(id)}/attachments?$select=id,name,size,isInline,contentType`)).json()) as { value: { id: string; name: string; size: number; isInline?: boolean; "@odata.type"?: string }[] };
        atts = a.value.filter((x) => !x.isInline && x["@odata.type"] === "#microsoft.graph.fileAttachment").map((x) => ({ id: x.id, name: x.name, size: x.size }));
      }
      const html = m.body?.contentType?.toLowerCase() === "html" ? m.body.content ?? "" : null;
      return { ...item(m, folder), to: (m.toRecipients ?? []).map((r) => who(r.emailAddress).name).join(", "), html, text: html ? "" : m.body?.content ?? "", atts };
    },
    async markRead(_folder, id) {
      await graphFetch(await t(), `/me/messages/${mid(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRead: true }) });
    },
    async reply(_folder, id, text) {
      await graphFetch(await t(), `/me/messages/${mid(id)}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: text }) });
    },
    async send(to, subject, text) {
      await graphFetch(await t(), "/me/sendMail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: text }, toRecipients: to.split(/[;,]/).map((a) => ({ emailAddress: { address: a.trim() } })).filter((r) => r.emailAddress.address) }, saveToSentItems: true }),
      });
    },
    async attachment(_folder, id, attId) {
      const token = await t();
      const meta = (await (await graphFetch(token, `/me/messages/${mid(id)}/attachments/${encodeURIComponent(attId)}?$select=name,contentType`)).json()) as { name: string; contentType?: string };
      const data = Buffer.from(await (await graphFetch(token, `/me/messages/${mid(id)}/attachments/${encodeURIComponent(attId)}/$value`)).arrayBuffer());
      return { name: meta.name, type: meta.contentType ?? "application/octet-stream", data };
    },
  };
}
