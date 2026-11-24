"use server";

import { revalidatePath } from "next/cache";
import { demoBlocked } from "@/lib/demo-guard";
import { z } from "zod";
import type { ActionState } from "@/lib/action";
import { encrypt } from "@/lib/crypto";
import { rateLimit, run } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { StravaError, forgetStravaSession, stravaAccount, stravaLogin, stravaOrder, stravaPublicMenu } from "@/lib/strava";

const fail = (e: unknown): ActionState => {
  if (e instanceof StravaError) return { error: e.message };
  console.error("strava action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};

/** Propojení Strava.cz: buď jen číslem jídelny (jídelníček bez přihlášení), nebo jménem a heslem, které se ověří přihlášením, heslo se uloží šifrovaně (Strava.cz nemá jiný způsob dlouhodobého přihlášení). */
export async function connectStrava(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  if (!rateLimit(`strava:connect:${user.id}`, 8, 3600)) return { error: "Moc pokusů, zkus to za chvíli." };
  const canteen = String(fd.get("canteen") ?? "").trim();
  if (!/^\d{1,10}$/.test(canteen)) return { error: "Číslo jídelny jsou jen číslice (najdeš ho na přihlašovací stránce Strava.cz)." };
  // Bez přihlášení se uloží jen číslo jídelny (prázdné jméno i heslo) a jídelníček se čte veřejně.
  const anon = fd.get("mode") === "anon";
  const username = anon ? "" : String(fd.get("username") ?? "").trim();
  const password = anon ? "" : String(fd.get("password") ?? "");
  if (!anon && (!username || !password)) return { error: "Napiš jméno a heslo ke Strava.cz." };
  try {
    if (anon) await stravaPublicMenu(canteen);
    else await stravaLogin(canteen, username, password);
  } catch (e) {
    return fail(e);
  }
  run("INSERT OR REPLACE INTO strava_accounts (user_id, username, password_enc, created_at, canteen) VALUES (?, ?, ?, ?, ?)", user.id, username, anon ? "" : encrypt(password), Date.now(), canteen);
  forgetStravaSession(user.id);
  revalidatePath("/nastaveni");
  revalidatePath("/obedy");
  return { ok: true };
}

export async function disconnectStrava() {
  const user = await requireUser();
  if (user.demo) return;
  run("DELETE FROM strava_accounts WHERE user_id = ?", user.id);
  forgetStravaSession(user.id);
  revalidatePath("/nastaveni");
  revalidatePath("/obedy");
}

const Order = z.object({ meal: z.coerce.number().int().positive(), want: z.enum(["1", "0"]), name: z.string().min(1).max(300) });

/** Objednání nebo zrušení jednoho jídla (každé jen na výslovné kliknutí uživatele). */
export async function orderMeal(fd: FormData) {
  const user = await requireUser();
  const v = Order.safeParse({ meal: fd.get("meal"), want: fd.get("want"), name: fd.get("name") });
  if (!stravaAccount(user.id) || stravaAccount(user.id)!.anon || !v.success) return;
  if (!rateLimit(`strava:order:${user.id}`, 60, 3600)) return;
  try {
    await stravaOrder(user.id, v.data.meal, v.data.want === "1", v.data.name);
  } catch (e) {
    console.error("strava order failed", e instanceof Error ? e.message : e);
    const q = new URLSearchParams({ chyba: e instanceof StravaError ? e.message : "Objednání se nepovedlo." });
    const { redirect } = await import("next/navigation");
    redirect(`/obedy?${q}`);
  }
  revalidatePath("/obedy");
}
