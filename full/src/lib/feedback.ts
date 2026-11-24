/** Zprávy pro správce téhle instance („Mám nápad“ v aplikaci) chodí e-mailem. Když se e-mail nepodaří odeslat, zpráva se uloží ve Správě, aby se neztratila. */
import { mailConfigured, sendMail } from "./mail";
import { DEFAULT_CONTACT } from "./contact";

/** Kam zprávy chodí: FEEDBACK_EMAIL, jinak CONTACT_EMAIL, jinak kontakt@classmate.cz (adresa zobrazená pod formulářem). */
export const ownerEmail = () => process.env.FEEDBACK_EMAIL?.trim() || process.env.CONTACT_EMAIL?.trim() || DEFAULT_CONTACT;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Pošle zprávu autorovi. Vrací true, když odešla; false, když e-mail není nastavený nebo odeslání selhalo. */
export async function mailOwner(o: { subject: string; lines: [string, string][]; message: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<boolean> {
  const to = ownerEmail();
  if (!to || !mailConfigured()) return false;
  const text = `${o.lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${o.message}\n`;
  const html = `<table style="font:14px system-ui,sans-serif;border-collapse:collapse">${o.lines.map(([k, v]) => `<tr><td style="padding:2px 14px 2px 0;color:#667">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table><p style="font:15px/1.55 system-ui,sans-serif;white-space:pre-wrap">${esc(o.message)}</p>`;
  try {
    const replyTo = o.replyTo && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(o.replyTo) ? o.replyTo : undefined; // do hlavičky jen skutečná adresa
    await sendMail({ to, subject: o.subject.replace(/[\r\n]+/g, " ").slice(0, 200), text, html, replyTo, attachments: o.attachments });
    return true;
  } catch (e) {
    console.error("feedback mail failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Přílohy ke zpětné vazbě: obrázky, PDF a prostý text. Rozpoznávají se podle obsahu, ne podle názvu nebo typu od prohlížeče. */
export const FEEDBACK_MAX_FILES = 4;
export const FEEDBACK_MAX_FILE = 8 * 1024 * 1024;
export const FEEDBACK_MAX_TOTAL = 20 * 1024 * 1024;

const SNIFF: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.length > 4 && b.toString("latin1", 0, 4) === "GIF8" },
  { mime: "image/webp", ext: "webp", test: (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.length > 5 && b.toString("latin1", 0, 5) === "%PDF-" },
  { mime: "text/plain", ext: "txt", test: (b) => b.length > 0 && !b.subarray(0, 4000).includes(0) },
];

/** Vrátí bezpečnou přílohu, nebo null, když to není obrázek, PDF ani text. Název se očistí a přípona určí podle obsahu. */
export function checkAttachment(name: string, data: Buffer) {
  const kind = SNIFF.find((k) => k.test(data));
  if (!kind) return null;
  const base = name.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}._ -]+/gu, "").trim().slice(0, 60) || "priloha";
  return { filename: `${base}.${kind.ext}`, content: data, contentType: kind.mime };
}
