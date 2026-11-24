import { readJson } from "@/lib/body";
import { visibleTest } from "@/lib/content";
import { pragueNow } from "@/lib/dates";
import { rateLimit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { saveProgress } from "@/lib/study";

export const dynamic = "force-dynamic";

/** Uloží postup uživatele ve studiu (umím kartičky, výsledek procvičování), ať ho má na všech zařízeních. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const test = visibleTest(user.id, user.class_id, Number((await params).id), pragueNow().date);
  if (!test) return Response.json({ error: "not_found" }, { status: 404 });
  if (!rateLimit(`study-progress:${user.id}`, 600, 3600)) return Response.json({ error: "rate" }, { status: 429 });
  const body = (await readJson<{ known?: unknown; quiz?: unknown }>(req, 8 * 1024));
  if (!body) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json({ ok: saveProgress(user.id, test.id, body) });
}
