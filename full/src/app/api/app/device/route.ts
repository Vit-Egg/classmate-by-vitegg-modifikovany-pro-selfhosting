import { z } from "zod";
import { authenticateDevice, registerDevice, revokeDevice, updateDevice } from "@/lib/app-devices";
import { readJson } from "@/lib/body";
import { rateLimit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const fcm = z.string().min(20).max(500).regex(/^[A-Za-z0-9_:.-]+$/);
const register = z.object({ platform: z.enum(["android", "ios"]), name: z.string().max(80).default(""), fcmToken: fcm.nullish(), appVersion: z.string().max(40).nullish() });
const update = z.object({ fcmToken: fcm.nullish(), appVersion: z.string().max(40).nullish() });

/**
 * Spáruje zařízení. Volá ho stránka v aplikaci (přihlášená cookie), vrací token zařízení, který stránka předá aplikaci.
 * Token se ukáže jen jednou, v databázi je jen jeho otisk.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!rateLimit(`appreg:${user.id}`, 20, 3600)) return Response.json({ error: "Moc pokusů, zkus to později." }, { status: 429 });
  const p = register.safeParse(await readJson(req, 4 * 1024));
  if (!p.success) return Response.json({ error: "Neplatná data zařízení." }, { status: 400 });
  const token = registerDevice(user.id, { platform: p.data.platform, name: p.data.name, fcmToken: p.data.fcmToken, appVersion: p.data.appVersion });
  return Response.json({ ok: true, token }, { headers: { "Cache-Control": "no-store" } });
}

/** Aplikace (token zařízení) hlásí nový token FCM nebo novou verzi. */
export async function PUT(req: Request) {
  const auth = authenticateDevice(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });
  const p = update.safeParse(await readJson(req, 4 * 1024));
  if (!p.success) return Response.json({ error: "Neplatná data." }, { status: 400 });
  updateDevice(auth.device.id, { fcmToken: p.data.fcmToken, appVersion: p.data.appVersion });
  return Response.json({ ok: true });
}

/** Odpojení zařízení (odhlášení v aplikaci). */
export async function DELETE(req: Request) {
  const auth = authenticateDevice(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });
  revokeDevice(auth.device.id);
  return Response.json({ ok: true });
}
