import { ImageError, saveImage } from "@/lib/images";
import { rateLimit } from "@/lib/db";
import { editableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";
import { crossSite } from "@/lib/origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Nahrání obrázku do vlastní poznámky (nebo poznámky, ke které jsem pozvaný k úpravě). Tělo požadavku je přímo soubor. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(req.headers)) return json({ error: "Zakázáno." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (user.demo) return json({ error: "V demu se soubory nenahrávají. Ve skutečném účtu to jde." }, 403);
  const noteId = Number((await params).id);
  if (!editableNote(user, noteId)) return json({ error: "Poznámka neexistuje." }, 404);
  if (!rateLimit(`image:${user.id}`, 120, 3600)) return json({ error: "Moc obrázků za krátkou dobu, zkus to později." }, 429);
  if (!req.body) return json({ error: "Chybí soubor." }, 400);
  const len = Number(req.headers.get("content-length"));
  try {
    return json(await saveImage({ userId: user.id, noteId, body: req.body, length: Number.isFinite(len) && len > 0 ? len : null }), 201);
  } catch (e) {
    if (e instanceof ImageError) return json({ error: e.message }, e.status);
    console.error("image upload failed", e);
    return json({ error: "Nahrání se nepovedlo." }, 500);
  }
}
