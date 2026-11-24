"use server";

import { revalidatePath } from "next/cache";
import { createFeed, deleteFeed, setFeedKinds } from "@/lib/calendar-feed";
import { requireUser } from "@/lib/session";
import { ServiceError, createCustomEvent, deleteCustomEvent, updateCustomEvent } from "@/lib/services";
import type { ActionState } from "@/lib/action";

/** Vytvoří (nebo obnoví) tajný odkaz k odběru kalendáře. Starý odkaz přestane fungovat. */
export async function regenerateFeed() {
  const user = await requireUser();
  createFeed(user.id);
  revalidatePath("/kalendar");
}

export async function removeFeed() {
  const user = await requireUser();
  deleteFeed(user.id);
  revalidatePath("/kalendar");
}

export async function saveFeedKinds(kinds: string[]) {
  const user = await requireUser();
  setFeedKinds(user.id, kinds);
}

const eventInput = (fd: FormData) => ({ title: fd.get("title"), date: fd.get("date"), start: fd.get("start"), end: fd.get("end"), note: fd.get("note"), private: fd.get("private") });

async function guard(fn: () => void): Promise<ActionState> {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath("/kalendar");
  return { ok: true };
}

/** Uloží vlastní událost (s `id` upraví existující). */
export async function saveEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  return guard(() => (id ? updateCustomEvent(user, id, eventInput(fd)) : void createCustomEvent(user, eventInput(fd))));
}

export async function removeEvent(id: number) {
  const user = await requireUser();
  await guard(() => deleteCustomEvent(user, id));
}
