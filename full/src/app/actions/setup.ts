"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/db";
import { clientIp, createSession } from "@/lib/session";
import { SetupError, createServer } from "@/lib/setup";
import type { ActionState } from "@/lib/action";

/** Průvodce prvním spuštěním: vytvoří školu, třídu a správce a rovnou ho přihlásí. */
export async function setupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!rateLimit(`setup:ip:${await clientIp()}`, 10, 900)) return { error: "Příliš mnoho pokusů. Zkus to za chvíli." };
  let id: number;
  try {
    id = createServer(
      { name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), school: fd.get("school"), bakalari: fd.get("bakalari") ?? "", class: fd.get("class") },
      String(fd.get("token") ?? ""),
    );
  } catch (e) {
    if (e instanceof SetupError) return { error: e.message };
    throw e;
  }
  await createSession(id);
  redirect("/nastaveni?k=propojeni");
}
