import { BodyTooLarge, readBytes } from "@/lib/body";
import { get, rateLimit } from "@/lib/db";
import { ImportError, MAX_IMPORT_BYTES, importNote } from "@/lib/import-note";
import { docToText } from "@/lib/markdown";
import { ServiceError, createNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Import souboru (.docx, .md, .txt) jako nové poznámky. Tělo požadavku je přímo soubor, název a předmět jsou v hlavičkách. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (!rateLimit(`noteimport:${user.id}`, 30, 3600)) return json({ error: "Importuješ moc často, zkus to za chvíli." }, 429);
  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_IMPORT_BYTES) return json({ error: "Soubor je moc velký (nejvíc 8 MB)." }, 413);
  let name = "";
  try {
    name = decodeURIComponent(req.headers.get("x-name") ?? "");
  } catch {}
  try {
    const data = await readBytes(req, MAX_IMPORT_BYTES);
    const r = importNote(name, data);
    const base = name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim();
    const subject = Number(req.headers.get("x-subject")) || null;
    const id = createNote(user, { subject: subject && get("SELECT 1 FROM user_subjects WHERE user_id = ? AND subject_id = ?", user.id, subject) ? subject : null, title: (r.title || base || "Importovaná poznámka").slice(0, 200), content: JSON.stringify(r.doc), text: docToText(r.doc) });
    return json({ id }, 201);
  } catch (e) {
    if (e instanceof BodyTooLarge) return json({ error: "Soubor je moc velký (nejvíc 8 MB)." }, 413);
    if (e instanceof ImportError || e instanceof ServiceError) return json({ error: e.message }, 400);
    console.error("note import failed", e);
    return json({ error: "Soubor se nepodařilo zpracovat." }, 500);
  }
}
