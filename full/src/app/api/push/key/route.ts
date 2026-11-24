import { getCurrentUser } from "@/lib/session";
import { vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  return Response.json({ key: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
