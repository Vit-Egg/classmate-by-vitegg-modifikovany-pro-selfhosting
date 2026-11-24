"use server";

import { revalidatePath } from "next/cache";
import { setBoardOn } from "@/lib/leaderboard";
import { requireUser } from "@/lib/session";

/** Zapojit se do žebříčku třídy, nebo z něj odejít (kdykoli, hned). */
export async function joinBoard(fd: FormData) {
  const user = await requireUser();
  if (user.demo) return;
  setBoardOn(user.id, fd.get("on") === "1");
  revalidatePath("/trofeje");
}
