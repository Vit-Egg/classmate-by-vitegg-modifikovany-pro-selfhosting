"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { BoardError, addComment, adminSetBoard, deleteComment, deletePost, markSeen, react, savePost, setPinned, vote } from "@/lib/board";
import { requireAdmin, requireUser } from "@/lib/session";

const refresh = () => {
  revalidatePath("/nastenka");
  revalidatePath("/", "layout");
};
const msg = (e: unknown): ActionState => {
  if (e instanceof BoardError) return { error: e.message };
  console.error("nastenka action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Nový nebo upravený příspěvek (u úpravy je v `id` jeho číslo). */
export async function savePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    savePost(user, {
      id: Number(fd.get("id")) || undefined,
      category: text(fd, "category"),
      title: text(fd, "title"),
      body: text(fd, "body"),
      link: text(fd, "link"),
      expires: text(fd, "expires"),
      pinned: fd.get("pinned") === "1",
      notify: fd.get("notify") === "1",
      email: fd.get("email") === "1",
      options: fd.get("poll") === "1" ? text(fd, "options").split("\n") : [],
    });
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function deletePostAction(fd: FormData) {
  const user = await requireUser();
  try {
    deletePost(user, Number(fd.get("id")));
  } catch (e) {
    console.error("board delete", e instanceof Error ? e.message : e);
  }
  refresh();
}

export async function pinAction(fd: FormData) {
  const user = await requireUser();
  try {
    setPinned(user, Number(fd.get("id")), fd.get("pin") === "1");
  } catch (e) {
    console.error("board pin", e instanceof Error ? e.message : e);
  }
  refresh();
}

export async function voteAction(fd: FormData) {
  const user = await requireUser();
  try {
    vote(user, Number(fd.get("post")), Number(fd.get("option")));
  } catch (e) {
    console.error("board vote", e instanceof Error ? e.message : e);
  }
  revalidatePath("/nastenka");
}

export async function reactAction(fd: FormData) {
  const user = await requireUser();
  try {
    react(user, Number(fd.get("post")), text(fd, "emoji"));
  } catch (e) {
    console.error("board react", e instanceof Error ? e.message : e);
  }
  revalidatePath("/nastenka");
}

export async function commentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    addComment(user, Number(fd.get("post")), text(fd, "body"));
  } catch (e) {
    return msg(e);
  }
  revalidatePath("/nastenka");
  return { ok: true };
}

export async function deleteCommentAction(fd: FormData) {
  const user = await requireUser();
  try {
    deleteComment(user, Number(fd.get("id")));
  } catch (e) {
    console.error("board comment delete", e instanceof Error ? e.message : e);
  }
  revalidatePath("/nastenka");
}

/** Při otevření nástěnky: označí příspěvky jako viděné a odznak v menu zmizí. */
export async function seenAction() {
  const user = await requireUser();
  markSeen(user.id);
  revalidatePath("/", "layout");
}

/** Zapnutí a vypnutí Nástěnky třídy u třídy (jen správce). */
export async function setBoard(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    adminSetBoard(admin, Number(fd.get("class")), fd.get("enabled") === "on");
  } catch (e) {
    return msg(e);
  }
  refresh();
  revalidatePath("/sprava");
  return { ok: true };
}
