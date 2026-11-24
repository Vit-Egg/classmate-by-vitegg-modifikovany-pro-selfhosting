import fs from "node:fs";
import { Readable } from "node:stream";
import { deleteAudio, ensurePlayable, filePath, getAudio } from "@/lib/audio";
import { run } from "@/lib/db";
import { readableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function access(params: Promise<{ id: string; aid: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const { id, aid } = await params;
  const row = getAudio(Number(aid));
  // nahrávku vidí ten, kdo smí číst poznámku (autor, nebo spolužák, když je poznámka sdílená)
  if (!row || row.note_id !== Number(id) || !readableNote(user, row.note_id)) return { error: new Response("Not found", { status: 404 }) } as const;
  return { user, row } as const;
}

/** Přehrání s podporou Range (bez ní nejde v Safari ani přetáčení). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  const row = await ensurePlayable(a.row);
  const file = filePath(row);
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": row.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}.${row.file.split(".").pop()}`,
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  if (a.row.user_id !== a.user.id) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return Response.json({ error: "Napiš název." }, { status: 400 });
  run("UPDATE note_audio SET name = ? WHERE id = ?", name, a.row.id);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const a = await access(params);
  if ("error" in a) return a.error;
  if (a.row.user_id !== a.user.id) return new Response("Forbidden", { status: 403 });
  deleteAudio(a.row);
  return Response.json({ ok: true });
}
