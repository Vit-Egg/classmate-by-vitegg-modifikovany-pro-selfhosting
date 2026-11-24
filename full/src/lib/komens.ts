/** Komens z Bakalářů: přijaté zprávy a nástěnka (jen čtení). Text zpráv se převede na prostý text, takže se do stránky nikdy nevkládá cizí HTML. */
import { bkBytes, bkCall, bkGet, bkJson } from "./bakalari";
import { get, run } from "./db";
import { notify } from "./messages";
import type { User } from "./session";
import { accessTokenFor, getCachedBox } from "./sync";
import { demoKomens } from "./demo";

export type KomensBox = "received" | "noticeboard" | "sent";
export type KomensAttachment = { id: string; name: string; size: number | null };
export type KomensMessage = { id: string; title: string; text: string; sentAt: string; sender: string; read: boolean; attachments: KomensAttachment[]; kind: string; canConfirm: boolean; confirmed: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** HTML (nebo HTML zapsané entitami) → prostý text s odstavci. */
export function toPlainText(raw: string): string {
  let s = String(raw ?? "");
  const decode = (t: string) => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m));
  if (/&lt;\/?[a-z]/i.test(s)) s = decode(s); // text s tagy zapsanými jako entity
  s = s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, "");
  return decode(s).replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

type Raw = { Id?: string; Title?: string; Text?: string; SentDate?: string; Sender?: { Name?: string }; Read?: boolean; Attachments?: { Id?: string; Name?: string; FileName?: string; Size?: number }[]; Type?: string; CanConfirm?: boolean; Confirmed?: boolean };
export const normalizeKomens = (m: Raw): KomensMessage => ({
  id: String(m.Id ?? ""),
  title: m.Title?.trim() || "(bez předmětu)",
  text: toPlainText(m.Text ?? ""),
  sentAt: m.SentDate ?? "",
  sender: m.Sender?.Name ?? "",
  read: m.Read !== false,
  attachments: (m.Attachments ?? []).filter((a) => a.Id).map((a) => ({ id: String(a.Id), name: a.Name ?? a.FileName ?? "priloha", size: typeof a.Size === "number" ? a.Size : null })),
  kind: m.Type ?? "",
  canConfirm: !!m.CanConfirm,
  confirmed: !!m.Confirmed,
});

/** Zprávy v dané složce; stahuje se přes POST, výsledek se drží v cache jako ostatní data z Bakalářů. */
export const getKomens = (user: User, box: KomensBox, force = false) =>
  getCachedBox<KomensMessage[]>(user, `komens:${box}`, force, async (token) => {
    const j = await bkCall<{ Messages?: Raw[] }>(user.bakalari_url!, token, `/api/3/komens/messages/${box}`, "POST");
    return (j?.Messages ?? []).map(normalizeKomens).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }, (data, prev) => {
    if (box === "sent" || !prev) return; // při prvním načtení se jen uloží základ
    const had = new Set(prev.map((m) => m.id));
    const fresh = data.filter((m) => !had.has(m.id) && !m.read);
    for (const m of fresh.slice(0, 5)) notify(user.id, { category: "komens", title: `${box === "noticeboard" ? "Nástěnka" : "Komens"}: ${m.title}`, body: `${m.sender}${m.text ? ` · ${m.text.slice(0, 160)}` : ""}`, link: `/komunikace?t=${box === "noticeboard" ? "nastenka" : "komens"}&m=${encodeURIComponent(m.id)}`, key: `komens:${m.id}` });
  });

/** Detail zprávy; nepřečtená se hned označí jako přečtená (v Bakalářích i v naší kopii seznamu). */
export async function komensDetail(user: User, box: KomensBox, id: string): Promise<KomensMessage | null> {
  if (user.demo) return demoKomens(box).find((m) => m.id === id) ?? null; // ukázkový účet: vymyšlené zprávy
  const token = await accessTokenFor(user);
  const j = await bkGet<{ Message?: Raw }>(user.bakalari_url!, token, `/api/3/komens/messages/${box}/${encodeURIComponent(id)}`);
  if (!j.Message) return null;
  const m = normalizeKomens(j.Message);
  if (!m.read && box !== "sent") {
    try {
      await bkCall(user.bakalari_url!, token, `/api/3/komens/message/${encodeURIComponent(id)}/mark-as-read`, "PUT");
      m.read = true;
      const key = `komens:${box}`;
      const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = ?", user.id, key);
      if (row) {
        const list = (JSON.parse(row.json) as KomensMessage[]).map((x) => (x.id === id ? { ...x, read: true } : x));
        run("UPDATE cache SET json = ? WHERE user_id = ? AND key = ?", JSON.stringify(list), user.id, key);
      }
    } catch {}
  }
  return m;
}

export async function komensAttachment(user: User, id: string) {
  return bkBytes(user.bakalari_url!, await accessTokenFor(user), `/api/3/komens/attachment/${encodeURIComponent(id)}`);
}

/** Počet nepřečtených z uložené kopie (bez dotazu na Bakaláře), pro odznak v menu. */
export function unreadKomens(userId: number): number {
  let n = 0;
  for (const key of ["komens:received", "komens:noticeboard"]) {
    const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = ?", userId, key);
    if (row) n += (JSON.parse(row.json) as KomensMessage[]).filter((m) => !m.read).length;
  }
  return n;
}

/* ---------- odesílání ---------- */

export type KomensRecipient = { code: string; name: string; isDefault: boolean };
export type KomensGroup = { code: string; name: string; selection: "none" | "one" | "many"; recipients: KomensRecipient[] };
export type KomensType = { code: string; name: string; hasTitle: boolean; canEmail: boolean; canConfirm: boolean; groups: KomensGroup[] };

type RawTypes = { MessageTypes?: { Abbreviation?: string; Name?: string; HasTitle?: boolean; ShowEmailNotification?: boolean; ShowConfirmation?: boolean; SuperType?: string; RecipientsTypes?: { Code?: string; Name?: string; TypeOfSelection?: string; Recipients?: { Code?: string; Name?: string; DisplayName?: string; IsDefault?: boolean }[] }[] }[] };

const typesCache = new Map<number, { at: number; data: KomensType[] }>();

/** Typy zpráv, které smí uživatel v Komens posílat, i s dostupnými skupinami příjemců (učitelé apod.). Na pár minut se drží v paměti. */
export async function komensTypes(user: User): Promise<KomensType[]> {
  const hit = typesCache.get(user.id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const token = await accessTokenFor(user);
  const j = await bkGet<RawTypes>(user.bakalari_url!, token, "/api/3/komens/message-types");
  const data = (j.MessageTypes ?? [])
    .filter((t) => t.Abbreviation && (t.SuperType ?? "Message") === "Message")
    .map((t): KomensType => ({
      code: t.Abbreviation!,
      name: t.Name ?? t.Abbreviation!,
      hasTitle: t.HasTitle !== false,
      canEmail: !!t.ShowEmailNotification,
      canConfirm: !!t.ShowConfirmation,
      groups: (t.RecipientsTypes ?? []).filter((g) => g.Code).map((g): KomensGroup => ({
        code: g.Code!,
        name: g.Name ?? g.Code!,
        selection: g.TypeOfSelection === "ZERO" ? "none" : g.TypeOfSelection === "ONE" ? "one" : "many",
        recipients: (g.Recipients ?? []).filter((r) => r.Code).map((r) => ({ code: r.Code!, name: r.DisplayName || r.Name || r.Code!, isDefault: !!r.IsDefault })),
      })),
    }));
  typesCache.set(user.id, { at: Date.now(), data });
  return data;
}

/** Odešle novou zprávu v Komens (nebo odpověď, když je zadané previousId). Hodnoty typu a příjemců se ověří proti tomu, co Bakaláři povolují. */
export async function komensSend(user: User, input: { type: string; group: string; recipients: string[]; title: string; text: string; confirm: boolean; email: boolean; previousId?: string }) {
  const types = await komensTypes(user);
  const type = types.find((t) => t.code === input.type);
  if (!type) throw new Error("Tenhle typ zprávy ti Bakaláři nepovolují.");
  const group = type.groups.find((g) => g.code === input.group);
  if (!group) throw new Error("Vyber, komu zprávu poslat.");
  if (group.selection !== "none") {
    if (!input.recipients.length) throw new Error("Vyber aspoň jednoho příjemce.");
    if (group.selection === "one" && input.recipients.length > 1) throw new Error("U tohohle typu jde vybrat jen jednoho příjemce.");
    const ok = new Set(group.recipients.map((r) => r.code));
    if (input.recipients.some((r) => !ok.has(r))) throw new Error("Vybraný příjemce není dostupný.");
  }
  const token = await accessTokenFor(user);
  await bkJson(user.bakalari_url!, token, "/api/3/komens/message", {
    MessageType: type.code,
    Title: type.hasTitle ? input.title : "",
    Text: input.text,
    RecipientType: group.code,
    Recipients: group.selection === "none" ? [] : input.recipients,
    Lifetime: null,
    DateFrom: null,
    DateTo: null,
    PreviousMessageId: input.previousId || null,
    CopyForClassTeacher: false,
    CopyForParent: false,
    EmailNotification: type.canEmail && input.email,
    SendAsDirector: false,
    RequireConfirmation: type.canConfirm && input.confirm,
    TypeOfRatingId: null,
    Scale: null,
    Attachments: [],
    DraftDate: null,
  });
  run("DELETE FROM cache WHERE user_id = ? AND key = 'komens:sent'", user.id); // odeslané se příště načtou znovu
}
