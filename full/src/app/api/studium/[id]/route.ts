import { visibleTest } from "@/lib/content";
import { aiEnabled } from "@/lib/ai";
import { rateLimit } from "@/lib/db";
import { pragueNow } from "@/lib/dates";
import { getCurrentUser } from "@/lib/session";
import { getProgress, regenerateStudy, startStudy, studyInputs, studyState } from "@/lib/study";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function load(id: string) {
  const user = await getCurrentUser();
  if (!user) return { res: json({ error: "unauthorized" }, 401) } as const;
  if (!aiEnabled() || user.demo) return { res: json({ error: "disabled" }, 404) } as const;
  const test = visibleTest(user.id, user.class_id, Number(id), pragueNow().date);
  if (!test) return { res: json({ error: "not_found" }, 404) } as const;
  return { user, test } as const;
}

const view = (userId: number, test: Parameters<typeof studyState>[0]) => ({ ...studyState(test), progress: getProgress(userId, test.id) });

/** Stav studijní sady k testu (nic / tvoří se / hotová s obsahem) spolu s postupem přihlášeného uživatele. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  if ("res" in r) return r.res;
  return json(view(r.user.id, r.test));
}

/**
 * Spustí vytvoření sady, pokud ještě není, nebo s { "regenerate": true } přegeneruje hotovou z aktuálních podkladů.
 * Samotné generování běží na serveru dál, studentovi stačí se k tomu vrátit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  if ("res" in r) return r.res;
  const regenerate = ((await req.json().catch(() => null)) as { regenerate?: unknown } | null)?.regenerate === true;
  const cur = studyState(r.test);
  if (cur.state === "generating" || (cur.state === "ready" && (!regenerate || cur.regenerating))) return json(view(r.user.id, r.test));
  const inputs = studyInputs(r.test);
  if (!inputs.ok) return json({ error: "no_input" }, 422);
  if (!rateLimit(`study:${r.user.id}`, 6, 3600)) return json({ error: "rate" }, 429);
  if (cur.state === "ready") regenerateStudy(r.user.id, r.test, inputs.notes);
  else startStudy(r.user.id, r.test, inputs.notes);
  return json(view(r.user.id, r.test));
}
