import { authenticateDevice } from "@/lib/app-devices";
import { all, get } from "@/lib/db";
import { fcmEnabled } from "@/lib/fcm";
import { quiet } from "@/lib/push";

export const dynamic = "force-dynamic";

const WINDOW_MS = 12 * 3600_000; // starší zprávy už oznamovat nemá smysl, stejně jako u push

/**
 * Nové zprávy pro aplikaci, která nemůže dostávat push přes Firebase (typicky server někoho jiného, než je oficiální).
 * Aplikace se ptá každých pár minut a oznámení si zobrazí sama. Bez `after` jen vrátí nejvyšší číslo zprávy (nic starého se neoznamuje).
 * V nočním klidu (PUSH_QUIET_HOURS) žádné zprávy nevrací, počkají do rána.
 */
export async function GET(req: Request) {
  const auth = authenticateDevice(req);
  if (!auth) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const uid = auth.user.id;
  const head = { "Cache-Control": "no-store" };
  const last = get<{ id: number | null }>("SELECT MAX(id) AS id FROM messages WHERE user_id = ?", uid)?.id ?? 0;
  const raw = new URL(req.url).searchParams.get("after");
  const after = raw == null ? null : Number(raw);
  if (after == null || !Number.isFinite(after)) return Response.json({ push: fcmEnabled(), last, items: [] }, { headers: head });
  if (quiet()) return Response.json({ push: fcmEnabled(), last: after, items: [] }, { headers: head });
  const items = all<{ id: number; title: string; body: string; link: string | null; category: string }>(
    "SELECT id, title, body, link, category FROM messages WHERE user_id = ? AND id > ? AND read_at IS NULL AND created_at > ? ORDER BY id LIMIT 10",
    uid, after, Date.now() - WINDOW_MS,
  );
  // kurzor jde dál jen k poslední doručené zprávě, ostatní (přečtené v mezičase) se přeskočí
  const cursor = items.length ? items[items.length - 1].id : Math.max(after, 0);
  return Response.json({ push: fcmEnabled(), last: cursor, items: items.map((m) => ({ id: m.id, title: m.title, body: m.body, url: m.link ?? "/dnes", category: m.category })) }, { headers: head });
}
