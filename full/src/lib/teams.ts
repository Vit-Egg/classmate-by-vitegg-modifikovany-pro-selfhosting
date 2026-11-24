/** Microsoft Teams přes Graph (stejné přihlášení jako školní e-mail): zadání (Teams Assignments) a nadcházející online schůzky. Jen čtení. */
import { accessToken, graphFetch } from "./mailbox/graph";
import { get } from "./db";

export type TeamsAssignment = { id: string; title: string; className: string; due: number | null; state: "todo" | "working" | "submitted" | "returned"; instructions: string; url: string };
export type TeamsMeeting = { id: string; title: string; start: number; end: number; organizer: string; joinUrl: string };

export const teamsAccount = (userId: number) => get<{ address: string }>("SELECT address FROM mail_accounts WHERE user_id = ? AND kind = 'microsoft'", userId);

const memo = new Map<string, { at: number; value: unknown }>();
async function cachedFor<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}

const strip = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();

type GAssign = { id: string; displayName?: string; dueDateTime?: string | null; status?: string; classId?: string; webUrl?: string; instructions?: { content?: string; contentType?: string } };
type GSub = { status?: string };

/** Zadání ze všech tříd v Teams, která jsou vypsaná a nejsou starší než dva týdny po termínu; u každého stav odevzdání. */
export function teamsAssignments(userId: number): Promise<TeamsAssignment[]> {
  return cachedFor(`as:${userId}`, 3 * 60_000, async () => {
    const t = await accessToken(userId);
    const [as, cls] = await Promise.all([
      graphFetch(t, "/education/me/assignments?$top=60").then((r) => r.json() as Promise<{ value: GAssign[] }>),
      graphFetch(t, "/education/me/classes").then((r) => r.json() as Promise<{ value: { id: string; displayName?: string }[] }>),
    ]);
    const names = new Map(cls.value.map((c) => [c.id, c.displayName ?? ""]));
    const horizon = Date.now() - 14 * 86_400_000;
    const list = as.value.filter((a) => (a.status === "assigned" || a.status === "published") && (!a.dueDateTime || Date.parse(a.dueDateTime) >= horizon)).slice(0, 25);
    const state = async (a: GAssign): Promise<TeamsAssignment["state"]> => {
      try {
        const s = (await (await graphFetch(t, `/education/classes/${a.classId}/assignments/${a.id}/submissions`)).json()) as { value: GSub[] };
        const st = s.value[0]?.status;
        return st === "submitted" ? "submitted" : st === "returned" ? "returned" : st === "working" ? "working" : "todo";
      } catch {
        return "todo";
      }
    };
    const states = await Promise.all(list.map(state));
    return list
      .map((a, i): TeamsAssignment => ({
        id: a.id, title: a.displayName ?? "Zadání", className: names.get(a.classId ?? "") ?? "", due: a.dueDateTime ? Date.parse(a.dueDateTime) : null, state: states[i],
        instructions: a.instructions?.content ? (a.instructions.contentType === "html" ? strip(a.instructions.content) : a.instructions.content).slice(0, 2000) : "",
        url: a.webUrl && /^https:\/\//.test(a.webUrl) ? a.webUrl : "https://teams.microsoft.com/",
      }))
      .sort((x, y) => (x.due ?? Infinity) - (y.due ?? Infinity));
  });
}

type GEvent = { id: string; subject?: string; isOnlineMeeting?: boolean; isCancelled?: boolean; start?: { dateTime?: string }; end?: { dateTime?: string }; organizer?: { emailAddress?: { name?: string } }; onlineMeeting?: { joinUrl?: string } | null };

/** Online schůzky (Teams) z kalendáře na dalších 7 dní. */
export function teamsMeetings(userId: number): Promise<TeamsMeeting[]> {
  return cachedFor(`mt:${userId}`, 2 * 60_000, async () => {
    const t = await accessToken(userId);
    const now = new Date();
    const q = new URLSearchParams({ startDateTime: now.toISOString(), endDateTime: new Date(+now + 7 * 86_400_000).toISOString(), $select: "id,subject,start,end,isOnlineMeeting,isCancelled,organizer,onlineMeeting", $orderby: "start/dateTime", $top: "60" });
    const j = (await (await graphFetch(t, `/me/calendarView?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } })).json()) as { value: GEvent[] };
    return j.value
      .filter((e) => e.isOnlineMeeting && !e.isCancelled && e.onlineMeeting?.joinUrl && /^https:\/\//.test(e.onlineMeeting.joinUrl))
      .map((e) => ({ id: e.id, title: e.subject || "Schůzka", start: Date.parse((e.start?.dateTime ?? "") + "Z"), end: Date.parse((e.end?.dateTime ?? "") + "Z"), organizer: e.organizer?.emailAddress?.name ?? "", joinUrl: e.onlineMeeting!.joinUrl! }));
  });
}

/* ---------- chaty, týmy, kanály, soubory ---------- */

export type TeamsChat = { id: string; name: string; kind: string; lastAt: number; preview: string; lastFrom: string };
export type TeamsMessage = { id: string; from: string; at: number; text: string; mine: boolean; system: boolean; attachments: { name: string; url: string }[]; replies?: number };
export type TeamsTeam = { id: string; name: string };
export type TeamsChannel = { id: string; name: string };
export type TeamsFile = { id: string; name: string; size: number | null; folder: boolean; url: string; modified: number };

const e = encodeURIComponent;
const text = (body?: { content?: string; contentType?: string }) => {
  const c = body?.content ?? "";
  return (body?.contentType === "html" ? strip(c) : c).slice(0, 8000).trim();
};
type GBody = { content?: string; contentType?: string };
type GMsg = { id: string; createdDateTime?: string; deletedDateTime?: string | null; messageType?: string; from?: { user?: { id?: string; displayName?: string } | null; application?: { displayName?: string } | null } | null; body?: GBody; attachments?: { name?: string; contentUrl?: string | null }[] };

const me = (userId: number) =>
  cachedFor(`me:${userId}`, 3600_000, async () => (await (await graphFetch(await accessToken(userId), "/me?$select=id,displayName")).json()) as { id: string; displayName: string });

const message = (m: GMsg, meId: string): TeamsMessage => ({
  id: m.id, from: m.from?.user?.displayName ?? m.from?.application?.displayName ?? "", at: m.createdDateTime ? Date.parse(m.createdDateTime) : 0, text: text(m.body), mine: m.from?.user?.id === meId, system: m.messageType !== undefined && m.messageType !== "message",
  attachments: (m.attachments ?? []).filter((a) => a.name && a.contentUrl && /^https:\/\//.test(a.contentUrl)).map((a) => ({ name: a.name!, url: a.contentUrl! })),
});
const visible = (list: GMsg[]) => list.filter((m) => !m.deletedDateTime);

export function teamsChats(userId: number): Promise<TeamsChat[]> {
  return cachedFor(`chats:${userId}`, 60_000, async () => {
    const t = await accessToken(userId);
    const [self, j] = await Promise.all([me(userId), graphFetch(t, "/me/chats?$expand=members,lastMessagePreview&$top=40&$orderby=lastMessagePreview/createdDateTime desc").then((r) => r.json() as Promise<{ value: { id: string; topic?: string | null; chatType?: string; members?: { userId?: string; displayName?: string }[]; lastMessagePreview?: { createdDateTime?: string; body?: GBody; from?: { user?: { displayName?: string } | null } | null; isDeleted?: boolean } | null }[] }>)]);
    return j.value.map((c): TeamsChat => {
      const others = (c.members ?? []).filter((m) => m.userId !== self.id).map((m) => m.displayName).filter(Boolean) as string[];
      const kind = c.chatType ?? "group";
      const p = c.lastMessagePreview;
      return { id: c.id, kind, name: c.topic || others.join(", ") || (kind === "meeting" ? "Schůzka" : "Chat"), lastAt: p?.createdDateTime ? Date.parse(p.createdDateTime) : 0, preview: p && !p.isDeleted ? text(p.body).replace(/\s+/g, " ").slice(0, 160) : "", lastFrom: p?.from?.user?.displayName ?? "" };
    });
  });
}

export async function teamsChatMessages(userId: number, chatId: string): Promise<TeamsMessage[]> {
  const [t, self] = await Promise.all([accessToken(userId), me(userId)]);
  const j = (await (await graphFetch(t, `/me/chats/${e(chatId)}/messages?$top=40`)).json()) as { value: GMsg[] };
  return visible(j.value).map((m) => message(m, self.id)).reverse();
}

export async function sendChatMessage(userId: number, chatId: string, content: string) {
  await graphFetch(await accessToken(userId), `/chats/${e(chatId)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: { contentType: "text", content } }) });
}

export function teamsTeams(userId: number): Promise<TeamsTeam[]> {
  return cachedFor(`teams:${userId}`, 5 * 60_000, async () => {
    const j = (await (await graphFetch(await accessToken(userId), "/me/joinedTeams?$select=id,displayName")).json()) as { value: { id: string; displayName?: string }[] };
    return j.value.map((x) => ({ id: x.id, name: x.displayName ?? "Tým" })).sort((a, b) => a.name.localeCompare(b.name, "cs"));
  });
}

export function teamsChannels(userId: number, teamId: string): Promise<TeamsChannel[]> {
  return cachedFor(`ch:${userId}:${teamId}`, 5 * 60_000, async () => {
    const j = (await (await graphFetch(await accessToken(userId), `/teams/${e(teamId)}/channels?$select=id,displayName`)).json()) as { value: { id: string; displayName?: string }[] };
    return j.value.map((x) => ({ id: x.id, name: x.displayName ?? "Kanál" }));
  });
}

export async function teamsChannelMessages(userId: number, teamId: string, channelId: string): Promise<TeamsMessage[]> {
  const [t, self] = await Promise.all([accessToken(userId), me(userId)]);
  const j = (await (await graphFetch(t, `/teams/${e(teamId)}/channels/${e(channelId)}/messages?$top=25`)).json()) as { value: GMsg[] };
  return visible(j.value).map((m) => message(m, self.id));
}

export async function teamsReplies(userId: number, teamId: string, channelId: string, messageId: string): Promise<TeamsMessage[]> {
  const [t, self] = await Promise.all([accessToken(userId), me(userId)]);
  const j = (await (await graphFetch(t, `/teams/${e(teamId)}/channels/${e(channelId)}/messages/${e(messageId)}/replies?$top=50`)).json()) as { value: GMsg[] };
  return visible(j.value).map((m) => message(m, self.id)).sort((a, b) => a.at - b.at);
}

export async function postChannel(userId: number, teamId: string, channelId: string, content: string, replyTo?: string) {
  const path = `/teams/${e(teamId)}/channels/${e(channelId)}/messages${replyTo ? `/${e(replyTo)}/replies` : ""}`;
  await graphFetch(await accessToken(userId), path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: { contentType: "text", content } }) });
}

/** Soubory týmu (knihovna dokumentů týmu); bez `folderId` kořen, jinak obsah složky. Soubory se otevírají přímo v SharePointu přes webUrl. */
export async function teamsFiles(userId: number, teamId: string, folderId?: string): Promise<TeamsFile[]> {
  const base = folderId ? `/groups/${e(teamId)}/drive/items/${e(folderId)}/children` : `/groups/${e(teamId)}/drive/root/children`;
  const j = (await (await graphFetch(await accessToken(userId), `${base}?$top=100&$select=id,name,size,folder,webUrl,lastModifiedDateTime&$orderby=name`)).json()) as { value: { id: string; name: string; size?: number; folder?: unknown; webUrl?: string; lastModifiedDateTime?: string }[] };
  return j.value.map((f) => ({ id: f.id, name: f.name, size: typeof f.size === "number" ? f.size : null, folder: !!f.folder, url: f.webUrl && /^https:\/\//.test(f.webUrl) ? f.webUrl : "", modified: f.lastModifiedDateTime ? Date.parse(f.lastModifiedDateTime) : 0 }));
}
