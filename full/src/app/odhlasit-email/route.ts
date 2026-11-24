import { unsubscribeEmail } from "@/lib/email-notify";
import { verifyToken } from "@/lib/mail-tokens";
import { run } from "@/lib/db";

export const dynamic = "force-dynamic";

const page = (title: string, text: string) =>
  new Response(
    `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;line-height:1.5"><h1 style="letter-spacing:-0.03em">${title}</h1><p>${text}</p><p><a href="/nastaveni">Nastavení Classmate</a></p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** Odhlášení z e-mailů jedním klikem (odkaz v patičce). */
export function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const b = verifyToken(t, "boardmail");
  if (b) {
    run("UPDATE users SET board_mail_off = 1 WHERE id = ?", b.u);
    return page("Odhlášeno", "E-maily z nástěnky třídy už ti posílat nebudeme. Ostatní e-maily z Classmate se tím nemění.");
  }
  const p = verifyToken(t, "unsub");
  if (!p) return page("Odkaz je neplatný", "Odběr e-mailů si můžeš vypnout v Nastavení Classmate.");
  unsubscribeEmail(p.u);
  return page("Odhlášeno", "E-mailová upozornění jsme vypnuli. Pořád je uvidíš v Classmate a v telefonu, pokud je tam máš zapnutá.");
}

/** Odhlášení z poštovního klienta (hlavička List-Unsubscribe-Post). */
export function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const b = verifyToken(t, "boardmail");
  if (b) {
    run("UPDATE users SET board_mail_off = 1 WHERE id = ?", b.u);
    return new Response("OK");
  }
  const p = verifyToken(t, "unsub");
  if (!p) return new Response("Invalid", { status: 400 });
  unsubscribeEmail(p.u);
  return new Response("OK");
}
