import fs from "node:fs";
import { Readable } from "node:stream";
import { run } from "@/lib/db";
import { deleteFile, filePath, getFile, isInline } from "@/lib/note-files";
import { readableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function access(params: Promise<{ id: string; fid: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const { id, fid } = await params;
  const row = getFile(Number(fid));
  // přílohu vidí ten, kdo smí číst poznámku (autor, pozvaný, nebo spolužák, když je poznámka sdílená)
  const note = row && row.note_id === Number(id) ? readableNote(user, row.note_id) : undefined;
  if (!row || !note) return { error: new Response("Not found", { status: 404 }) } as const;
  return { user, row, note } as const;
}

/** Otevření (PDF a obrázky v prohlížeči) nebo stažení (?stahnout=1, ostatní typy vždy). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  const file = filePath(a.row);
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const inline = isInline(a.row) && !new URL(req.url).searchParams.has("stahnout");
  const ascii = a.row.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": a.row.mime,
    "Content-Length": String(size),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.row.name)}`,
  };
  // obrázky se zobrazují v izolaci; PDF musí bez sandboxu, jinak ho prohlížeč nevykreslí
  if (a.row.mime.startsWith("image/")) headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
}

/** Přejmenovat nebo smazat smí ten, kdo přílohu nahrál, a vlastník poznámky. */
const canManage = (a: { user: { id: number }; row: { user_id: number }; note: { owner_id: number } }) => a.row.user_id === a.user.id || a.note.owner_id === a.user.id;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  if (!canManage(a)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(a.row.name)?.[0] ?? "";
  let name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 140) : "";
  if (!name) return Response.json({ error: "Napiš název." }, { status: 400 });
  if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext; // přípona se zachová, sedí na ni typ souboru
  run("UPDATE note_files SET name = ? WHERE id = ?", name, a.row.id);
  return Response.json({ ok: true, name });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  if (!canManage(a)) return new Response("Forbidden", { status: 403 });
  deleteFile(a.row);
  return Response.json({ ok: true });
}
