import { readJson } from "@/lib/body";
import { z } from "zod";
import { all, run } from "@/lib/db";
import { allowedEndpoint } from "@/lib/push";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const b64 = z.string().regex(/^[A-Za-z0-9_-]{16,200}$/);
const sub = z.object({ endpoint: z.string(), keys: z.object({ p256dh: b64, auth: b64 }) });

/** Uloží odběr upozornění tohoto zařízení. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const p = sub.safeParse(await readJson(req, 8 * 1024));
  if (!p.success || !allowedEndpoint(p.data.endpoint)) return Response.json({ error: "Neplatný odběr." }, { status: 400 });
  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  // stejný endpoint patří vždy jedinému uživateli (po přihlášení jiného účtu na stejném zařízení se přepíše)
  run(
    "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent",
    user.id, p.data.endpoint, p.data.keys.p256dh, p.data.keys.auth, ua, Date.now(),
  );
  const mine = all<{ id: number }>("SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC", user.id);
  for (const old of mine.slice(10)) run("DELETE FROM push_subscriptions WHERE id = ?", old.id);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = (await readJson(req, 8 * 1024)) as { endpoint?: string } | null;
  if (body?.endpoint) run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", body.endpoint, user.id);
  return Response.json({ ok: true });
}
