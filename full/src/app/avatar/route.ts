import { AvatarError, MAX_AVATAR, avatarVersion, saveAvatar } from "@/lib/avatar";
import { BodyTooLarge, readBytes } from "@/lib/body";
import { rateLimit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Nahrání vlastní profilovky: tělo požadavku je přímo (už zmenšený) obrázek. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (user.demo) return json({ error: "V demu se soubory nenahrávají. Ve skutečném účtu to jde." }, 403);
  if (!rateLimit(`avatar:${user.id}`, 20, 3600)) return json({ error: "Moc změn za krátkou dobu, zkus to později." }, 429);
  try {
    saveAvatar(user.id, await readBytes(req, MAX_AVATAR));
  } catch (e) {
    if (e instanceof BodyTooLarge) return json({ error: "Obrázek je moc velký." }, 413);
    if (e instanceof AvatarError) return json({ error: e.message }, e.status);
    console.error("avatar upload failed", e);
    return json({ error: "Nahrání se nepovedlo." }, 500);
  }
  return json({ version: avatarVersion(user.id) }, 201);
}
