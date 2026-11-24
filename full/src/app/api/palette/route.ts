import { all } from "@/lib/db";
import { listTasks, listTests } from "@/lib/content";
import { pragueNow } from "@/lib/dates";
import { getCurrentUser } from "@/lib/session";
import { userSubjects } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** Data pro příkazovou paletu (Ctrl/Cmd+K): předměty, poznámky, otevřené úkoly a nadcházející testy uživatele. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const notes = all<{ id: number; title: string; subject: string | null }>(
    "SELECT n.id, n.title, s.name AS subject FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id WHERE n.user_id = ? AND n.deleted_at IS NULL ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 300",
    user.id,
  );
  const tasks = listTasks(user.id, user.class_id, false).slice(0, 100).map((t) => ({ id: t.id, title: t.title, subject: t.subject_name ?? undefined, due: t.due_date }));
  const tests = listTests(user.id, user.class_id, pragueNow().date).slice(0, 50).map((t) => ({ id: t.id, subject: t.subject_name, date: t.date, topic: t.topic }));
  const subjects = userSubjects(user.id).map((s) => ({ id: s.id, name: s.name }));
  return Response.json({ subjects, notes, tasks, tests }, { headers: { "Cache-Control": "no-store" } });
}
