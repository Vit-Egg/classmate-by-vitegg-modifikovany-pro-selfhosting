"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteMessages, markRead, toggleCategory, type Category } from "@/lib/messages";
import { requireUser } from "@/lib/session";
import { get } from "@/lib/db";

/** Otevře zprávu: označí ji jako přečtenou a přejde na to, čeho se týká. */
export async function openMessage(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  const m = get<{ link: string | null }>("SELECT link FROM messages WHERE id = ? AND user_id = ?", id, user.id);
  markRead(user.id, id);
  revalidatePath("/", "layout");
  redirect(m?.link && /^\/(?![/\\])/.test(m.link) ? m.link : "/dnes");
}

export async function readAll() {
  const user = await requireUser();
  markRead(user.id);
  revalidatePath("/", "layout");
}

/** Smaže jednu zprávu (id), nebo všechny, když id chybí. */
export async function removeMessages(id?: number) {
  const user = await requireUser();
  deleteMessages(user.id, Number.isInteger(id) && id! > 0 ? id : undefined);
  revalidatePath("/", "layout");
}

export async function setCategory(fd: FormData) {
  const user = await requireUser();
  const c = String(fd.get("category"));
  if (["timetable", "marks", "absence", "classwork", "komens", "duty", "cash", "notes"].includes(c)) toggleCategory(user.id, c as Category);
  revalidatePath("/", "layout");
}
