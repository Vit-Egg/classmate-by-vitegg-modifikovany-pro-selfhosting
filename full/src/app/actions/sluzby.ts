"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { DutyError, adminReroll, adminSetDuty, adminSetExempt, adminSetWeek, adminSkipWeek } from "@/lib/duty";
import { requireAdmin } from "@/lib/session";

const refresh = () => {
  revalidatePath("/sluzby");
  revalidatePath("/dnes");
  revalidatePath("/sprava");
};
const msg = (e: unknown): ActionState => {
  if (e instanceof DutyError) return { error: e.message };
  console.error("sluzby action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};

/** Zapnutí a vypnutí Třídních služeb u třídy (jen správce). */
export async function setDuty(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    adminSetDuty(admin, Number(fd.get("class")), fd.get("enabled") === "on");
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function setExempt(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminSetExempt(admin, Number(fd.get("class")), Number(fd.get("user")), fd.get("exempt") === "1");
  } catch (e) {
    console.error("duty exempt", e instanceof Error ? e.message : e);
  }
  refresh();
}

export async function rerollWeek(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminReroll(admin, Number(fd.get("class")), String(fd.get("week")));
  } catch (e) {
    console.error("duty reroll", e instanceof Error ? e.message : e);
  }
  refresh();
}

/** Ručně určí, kdo má službu v týdnu (políčka `p` s id lidí). */
export async function setWeek(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminSetWeek(admin, Number(fd.get("class")), String(fd.get("week")), fd.getAll("p").map(Number));
  } catch (e) {
    console.error("duty set", e instanceof Error ? e.message : e);
  }
  refresh();
}

export async function skipWeek(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminSkipWeek(admin, Number(fd.get("class")), String(fd.get("week")), fd.get("skip") === "1");
  } catch (e) {
    console.error("duty skip", e instanceof Error ? e.message : e);
  }
  refresh();
}
