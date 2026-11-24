import { rateLimit } from "@/lib/db";
import { pushToUser } from "@/lib/push";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Zkušební upozornění na všechna zařízení uživatele. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!rateLimit(`push-test:${user.id}`, 6, 300)) return Response.json({ error: "Moc často, zkus to za chvíli." }, { status: 429 });
  const sent = await pushToUser(user.id, { title: "Classmate", body: "Upozornění fungují. Takhle budou vypadat zprávy.", url: "/dnes", tag: "classmate-test" });
  return Response.json({ sent });
}
