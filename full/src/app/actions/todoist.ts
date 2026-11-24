"use server";

import { revalidatePath } from "next/cache";
import { demoBlocked } from "@/lib/demo-guard";
import { rateLimit } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TodoistError, connectTodoist, disconnectTodoist, syncTodoist, todoistAccount } from "@/lib/todoist";
import type { ActionState } from "@/lib/action";

export async function connectTodoistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const blocked = demoBlocked(user);
  if (blocked) return blocked;
  if (!rateLimit(`todoist:connect:${user.id}`, 8, 900)) return { error: "Příliš mnoho pokusů. Zkus to za chvíli." };
  try {
    await connectTodoist(user, String(fd.get("token") ?? ""), String(fd.get("project") ?? ""));
  } catch (e) {
    if (e instanceof TodoistError) return { error: e.message };
    throw e;
  }
  revalidatePath("/nastaveni");
  return { ok: true, message: "Todoist je propojený. Úkoly se začnou zapisovat." };
}

/** Ruční srovnání hned, bez čekání na pravidelný běh. */
export async function syncTodoistNow() {
  const user = await requireUser();
  if (user.demo) return;
  if (todoistAccount(user.id) && rateLimit(`todoist:sync:${user.id}`, 6, 300)) await syncTodoist(user);
  revalidatePath("/nastaveni");
}

export async function disconnectTodoistAction() {
  const user = await requireUser();
  if (user.demo) return;
  disconnectTodoist(user.id);
  revalidatePath("/nastaveni");
}
