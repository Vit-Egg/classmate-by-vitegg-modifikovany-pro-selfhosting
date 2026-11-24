/** Odesílání e-mailů přes SMTP (nodemailer). Zapíná se proměnnými SMTP_*; bez nich se e-maily neposílají a nastavení v aplikaci to řekne. */
import nodemailer, { type Transporter } from "nodemailer";

export const mailConfigured = () => !!process.env.SMTP_HOST?.trim() && !!process.env.SMTP_FROM?.trim();

let transport: Transporter | null = null;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465, // 465 = TLS hned, 587 = STARTTLS
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export type Mail = { to: string; subject: string; text: string; html: string; /** adresa pro odhlášení jedním klikem (hlavička List-Unsubscribe) */ unsubscribeUrl?: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] };

export async function sendMail(m: Mail) {
  if (!mailConfigured()) throw new Error("SMTP není nastavené.");
  await getTransport().sendMail({
    from: process.env.SMTP_FROM!.trim(),
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    text: m.text,
    html: m.html,
    attachments: m.attachments,
    headers: m.unsubscribeUrl ? { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  });
}
