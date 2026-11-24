import { authenticateDevice } from "@/lib/app-devices";
import { buildSnapshot } from "@/lib/app-snapshot";

export const dynamic = "force-dynamic";

/** Obraz dne pro widget a trvalou notifikaci mobilní aplikace (ověřuje se tokenem zařízení). */
export async function GET(req: Request) {
  const auth = authenticateDevice(req);
  if (!auth) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json(await buildSnapshot(auth.user), { headers: { "Cache-Control": "no-store" } });
}
