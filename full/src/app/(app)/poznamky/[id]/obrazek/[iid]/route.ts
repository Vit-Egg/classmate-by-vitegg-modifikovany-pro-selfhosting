import fs from "node:fs";
import { getImage, imagePath } from "@/lib/images";
import { readableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Zobrazení obrázku. Vidí ho ten, kdo smí číst poznámku (autor, nebo spolužák u sdílené poznámky). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; iid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id, iid } = await params;
  const img = getImage(Number(iid));
  if (!img || img.note_id !== Number(id) || !readableNote(user, img.note_id)) return new Response("Not found", { status: 404 });
  let data: Buffer;
  try {
    data = fs.readFileSync(imagePath(img));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": img.mime, "Content-Length": String(data.length), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
