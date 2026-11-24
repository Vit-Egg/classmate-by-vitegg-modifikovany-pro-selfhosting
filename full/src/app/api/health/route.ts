import { get } from "@/lib/db";
import { versionLabel } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Pro Docker healthcheck a monitoring. Neprozrazuje nic kromě toho, že DB odpovídá. */
export async function GET() {
  try {
    get("SELECT 1");
    return Response.json({ ok: true, version: versionLabel() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
