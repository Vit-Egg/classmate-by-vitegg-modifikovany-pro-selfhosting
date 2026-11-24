import { readAvatar } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Profilovka uživatele. Jen pro přihlášené, adresa nese verzi (?v=), takže se dá cachovat napořád. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Přihlas se.", { status: 401 });
  const id = Number((await params).id);
  const a = Number.isInteger(id) ? readAvatar(user, id) : null;
  if (!a) return new Response("Nenalezeno.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(a.data), {
    headers: { "Content-Type": a.mime, "Cache-Control": "private, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" },
  });
}
