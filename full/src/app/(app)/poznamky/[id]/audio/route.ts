import { AudioError, saveAudio } from "@/lib/audio";
import { get, rateLimit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { crossSite } from "@/lib/origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Nahrání zvukového souboru k vlastní poznámce. Tělo požadavku je přímo soubor, název a délka jsou v hlavičkách. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(req.headers)) return json({ error: "Zakázáno." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (user.demo) return json({ error: "V demu se soubory nenahrávají. Ve skutečném účtu to jde." }, 403);
  const noteId = Number((await params).id);
  if (!get("SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", noteId, user.id)) return json({ error: "Poznámka neexistuje." }, 404);
  if (!rateLimit(`audio:${user.id}`, 40, 3600)) return json({ error: "Moc nahrávek za krátkou dobu, zkus to později." }, 429);
  if (!req.body) return json({ error: "Chybí soubor." }, 400);
  const len = Number(req.headers.get("content-length"));
  const duration = Number(req.headers.get("x-duration"));
  let name = "";
  try {
    name = decodeURIComponent(req.headers.get("x-name") ?? "");
  } catch {}
  try {
    const item = await saveAudio({ userId: user.id, noteId, body: req.body, length: Number.isFinite(len) && len > 0 ? len : null, name, duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null });
    return json(item, 201);
  } catch (e) {
    if (e instanceof AudioError) return json({ error: e.message }, e.status);
    console.error("audio upload failed", e);
    return json({ error: "Nahrání se nepovedlo." }, 500);
  }
}
