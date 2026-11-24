import { all } from "@/lib/db";
import { listMessages, unreadCount } from "@/lib/messages";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Počet nepřečtených a nové zprávy od posledně (pro odznak a upozornění v prohlížeči). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;
  const fresh = all<{ id: number; title: string; body: string; link: string | null; category: string }>("SELECT id, title, body, link, category FROM messages WHERE user_id = ? AND id > ? AND read_at IS NULL ORDER BY id DESC LIMIT 5", user.id, after);
  const last = all<{ id: number }>("SELECT MAX(id) AS id FROM messages WHERE user_id = ?", user.id)[0]?.id ?? 0;
  const items = new URL(req.url).searchParams.has("list")
    ? listMessages(user.id, undefined, 30).map((m) => ({ id: m.id, title: m.title, body: m.body, category: m.category, read: !!m.read_at, created_at: m.created_at }))
    : undefined;
  return Response.json({ unread: unreadCount(user.id), last, fresh, items }, { headers: { "Cache-Control": "no-store" } });
}
