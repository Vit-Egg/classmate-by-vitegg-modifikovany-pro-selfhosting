import { rateLimit } from "@/lib/db";
import { FileError, saveFile } from "@/lib/note-files";
import { editableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";
import { crossSite } from "@/lib/origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Nahrání přílohy do vlastní poznámky (nebo poznámky, ke které jsem pozvaný k úpravě). Tělo požadavku je přímo soubor, název je v hlavičce X-Name. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(req.headers)) return json({ error: "Zakázáno." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (user.demo) return json({ error: "V demu se soubory nenahrávají. Ve skutečném účtu to jde." }, 403);
  const noteId = Number((await params).id);
  if (!editableNote(user, noteId)) return json({ error: "Poznámka neexistuje." }, 404);
  if (!rateLimit(`note-file:${user.id}`, 60, 3600)) return json({ error: "Moc příloh za krátkou dobu, zkus to později." }, 429);
  if (!req.body) return json({ error: "Chybí soubor." }, 400);
  const len = Number(req.headers.get("content-length"));
  let name = "";
  try {
    name = decodeURIComponent(req.headers.get("x-name") ?? "");
  } catch {}
  try {
    return json(await saveFile({ userId: user.id, noteId, body: req.body, length: Number.isFinite(len) && len > 0 ? len : null, name }), 201);
  } catch (e) {
    if (e instanceof FileError) return json({ error: e.message }, e.status);
    console.error("note file upload failed", e);
    return json({ error: "Nahrání se nepovedlo." }, 500);
  }
}
