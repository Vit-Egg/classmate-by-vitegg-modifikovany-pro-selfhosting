import { all, get } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPref } from "@/lib/prefs";
import { betterThan, contributorOf, markKey, MIN_DIST, MIN_PEOPLE } from "@/lib/stats";
import type { MarksData } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Anonymní rozdělení jedné známky (kolik lidí dostalo jaké hodnoty), jen když ji sdílí aspoň MIN_DIST lidí. Bez jmen, jen počty. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = (await params).id;
  const row = get<{ json: string }>("SELECT json FROM cache WHERE user_id = ? AND key = 'marks'", user.id);
  const data = row ? (JSON.parse(row.json) as MarksData) : null;
  const subject = data?.subjects.find((s) => s.marks.some((m) => m.id === id));
  const mark = subject?.marks.find((m) => m.id === id);
  if (!subject || !mark || mark.value == null || !mark.date) return Response.json({ error: "Známka neexistuje." }, { status: 404 });
  const key = markKey(user.school_id, subject.name, mark.caption, mark.date);
  const rows = all<{ value: number; n: number }>("SELECT value, COUNT(*) AS n FROM stat_marks WHERE mark_key = ? GROUP BY value ORDER BY value", key);
  const total = rows.reduce((a, r) => a + r.n, 0);
  const others = all<{ value: number }>("SELECT value FROM stat_marks WHERE mark_key = ? AND contributor != ?", key, contributorOf(user.id)).map((r) => r.value);
  const body = { subject: subject.name, caption: mark.caption, mine: mark.value, enough: total >= MIN_DIST, min: MIN_DIST, total: total >= MIN_DIST ? total : undefined, counts: total >= MIN_DIST ? rows : [], better: total >= MIN_DIST && user.share_marks_stats === 1 && getPref(user, "marks_pct") === "1" ? betterThan(others, mark.value) : undefined };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
