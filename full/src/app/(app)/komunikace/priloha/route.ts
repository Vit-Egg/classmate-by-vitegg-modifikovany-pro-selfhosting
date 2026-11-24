import { NextRequest } from "next/server";
import { BakalariError } from "@/lib/bakalari";
import { komensAttachment } from "@/lib/komens";
import { MailError, mailbox, type Folder } from "@/lib/mailbox";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const safeName = (n: string) => n.replace(/[\r\n"\\/]/g, "_").slice(0, 150) || "priloha";
/** Záhlaví smí nést jen ASCII: háčky a čárky v klasickém `filename=` shodí odpověď, plný název jde přes `filename*`. */
const asciiName = (n: string) => safeName(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_");
/** Název ze záhlaví Content-Disposition u příloh z Bakalářů (`filename*=utf-8''…`, jinak `name=`). */
function nameFrom(disposition: string) {
  const star = /filename\*=utf-8''([^;]+)/i.exec(disposition)?.[1];
  if (star) try { return decodeURIComponent(star); } catch {}
  const plain = /name="?([^";]+)"?/i.exec(disposition)?.[1] ?? "";
  const b64 = /^=\?utf-8\?B\?(.+)\?=$/i.exec(plain)?.[1];
  return b64 ? Buffer.from(b64, "base64").toString("utf8") : plain;
}

/** Stažení přílohy: ?k=komens&id=… nebo ?k=posta&f=inbox&m=…&a=… . Vždy se stahuje jako soubor, nikdy se neotevírá ve stránce. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const p = req.nextUrl.searchParams;
  try {
    let name: string, type: string, data: Buffer;
    if (p.get("k") === "komens") {
      const r = await komensAttachment(user, p.get("id") ?? "");
      name = nameFrom(r.disposition) || p.get("n") || "priloha";
      type = "application/octet-stream";
      data = r.data;
    } else {
      const f: Folder = p.get("f") === "sent" ? "sent" : "inbox";
      const r = await mailbox(user).attachment(f, p.get("m") ?? "", p.get("a") ?? "");
      ({ name, data } = r);
      type = "application/octet-stream";
    }
    return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(safeName(name))}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Length": String(data.length) } });
  } catch (e) {
    if (e instanceof BakalariError || e instanceof MailError) return new Response("Přílohu se nepodařilo stáhnout.", { status: 502 });
    throw e;
  }
}
