import { all, rateLimit } from "@/lib/db";
import { getPref } from "@/lib/prefs";
import { getCurrentUser } from "@/lib/session";
import { subjectDetail } from "@/lib/subjects";
import { subjectSummary, summaryEnabled } from "@/lib/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Shrnutí předmětu; vytvoří se při prvním otevření v daném půldni a pak se jen vrací uložené. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!summaryEnabled() || user.demo) return json({ error: "disabled" }, 404);
  if (getPref(user, "ai_sum") !== "1") return json({ error: "consent" }, 403);
  const d = await subjectDetail(user, Number((await params).id));
  if (!d) return json({ error: "not_found" }, 404);
  if (!rateLimit(`summary:${user.id}`, 40, 3600)) return json({ error: "rate" }, 429);
  const notes = all<{ title: string; text: string }>("SELECT title, text FROM notes WHERE user_id = ? AND subject_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 8", user.id, d.subject.id);
  try {
    const s = await subjectSummary(user, d, notes);
    return json(s);
  } catch {
    return json({ error: "failed" }, 502);
  }
}
