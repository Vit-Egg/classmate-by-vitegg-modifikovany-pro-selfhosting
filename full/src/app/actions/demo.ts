"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/db";
import { clientIp, createSession, destroySession, getCurrentUser } from "@/lib/session";
import { DemoError, createVisitorDemo, demoPublicEnabled, endVisitorDemo } from "@/lib/demo-visitor";
import type { ActionState } from "@/lib/action";

/** Spustí vlastní demo návštěvníka (bez registrace) a rovnou ho přihlásí. */
export async function startDemo(_: ActionState, __: FormData): Promise<ActionState> {
  if (!demoPublicEnabled()) return { error: "Demo je na tomhle serveru vypnuté." };
  const me = await getCurrentUser();
  if (me && !me.demo) redirect("/dnes"); // skutečný účet si demo zakládat nemusí
  // Škola sdílí jednu veřejnou adresu, proto je limit na adresu štědrý; celkový počet dem hlídá DEMO_MAX.
  if (!rateLimit(`demo:ip:${await clientIp()}`, 40, 3600)) return { error: "Z téhle sítě bylo spuštěno moc dem, zkus to později." };
  let id: number;
  try {
    id = createVisitorDemo();
  } catch (e) {
    if (e instanceof DemoError) return { error: e.message };
    console.error("demo start failed", e);
    return { error: "Demo se nepodařilo spustit." };
  }
  if (me?.demo) await destroySession(); // původní demo se nechá doběhnout, nové začíná znovu
  await createSession(id);
  redirect("/dnes");
}

/** Ukončí demo (smaže vymyšlená data) a pošle návštěvníka na přihlášení nebo registraci. */
export async function endDemo(fd: FormData) {
  const me = await getCurrentUser();
  if (me?.demo) {
    await destroySession();
    endVisitorDemo(me);
  }
  redirect(fd.get("to") === "register" ? "/registrace" : "/prihlaseni");
}
