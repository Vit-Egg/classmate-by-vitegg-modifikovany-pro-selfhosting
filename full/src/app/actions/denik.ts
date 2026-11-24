"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { rateLimit } from "@/lib/db";
import { IntervalsError, connectIntervals, disconnectIntervals, importIntervals } from "@/lib/intervals";
import { requireAdmin, requireUser } from "@/lib/session";
import { TrainingError, deleteEntry, deleteReflection, addEntry, saveProfile, saveReflection, setSchoolTraining, setTrainingEnabled, trainingActive, updateEntry } from "@/lib/training";

const refresh = () => {
  revalidatePath("/denik");
  revalidatePath("/nastaveni");
  revalidatePath("/sprava");
};
const msg = (e: unknown): ActionState => {
  if (e instanceof TrainingError || e instanceof IntervalsError) return { error: e.message };
  console.error("denik action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};
const obj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

/** Škola povoluje modul (jen správce). */
export async function setSchoolTrainingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    setSchoolTraining(Number(fd.get("school")), fd.get("enabled") === "on");
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

/** Žák si deník zapne nebo vypne (záznamy zůstávají). */
export async function setTrainingAction(fd: FormData) {
  const user = await requireUser();
  try {
    setTrainingEnabled(user, fd.get("enabled") === "1");
  } catch (e) {
    console.error("denik toggle failed", e);
  }
  refresh();
}

async function active() {
  const user = await requireUser();
  if (!trainingActive(user)) throw new TrainingError("Tréninkový deník nemáš zapnutý.");
  return user;
}

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    saveProfile(await active(), obj(fd));
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true, message: "Uloženo." };
}

export async function saveEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await active();
    if (!rateLimit(`denik:entry:${user.id}`, 120, 3600)) throw new TrainingError("Moc zápisů najednou, zkus to za chvíli.");
    const id = Number(fd.get("id"));
    if (id) updateEntry(user, id, obj(fd));
    else addEntry(user, obj(fd));
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function deleteEntryAction(fd: FormData) {
  try {
    deleteEntry(await active(), Number(fd.get("id")));
  } catch (e) {
    console.error("denik delete failed", e);
  }
  refresh();
}

export async function saveReflectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    saveReflection(await active(), Number(fd.get("id")) || null, obj(fd));
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function deleteReflectionAction(fd: FormData) {
  try {
    deleteReflection(await active(), Number(fd.get("id")));
  } catch (e) {
    console.error("denik delete failed", e);
  }
  refresh();
}

export async function connectIntervalsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await active();
    if (!rateLimit(`intervals:connect:${user.id}`, 8, 3600)) throw new TrainingError("Moc pokusů, zkus to za chvíli.");
    await connectIntervals(user, String(fd.get("athlete") ?? ""), String(fd.get("key") ?? ""));
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function disconnectIntervalsAction() {
  const user = await requireUser();
  disconnectIntervals(user.id);
  refresh();
}

export async function importIntervalsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await active();
    if (!rateLimit(`intervals:import:${user.id}`, 20, 3600)) throw new TrainingError("Moc načítání, zkus to za chvíli.");
    const r = await importIntervals(user, String(fd.get("from") ?? ""), String(fd.get("to") ?? ""));
    refresh();
    const parts = [`Přidáno ${r.added} ${r.added === 1 ? "zápis" : r.added >= 2 && r.added <= 4 ? "zápisy" : "zápisů"}`];
    if (r.skipped) parts.push(`${r.skipped} už v deníku bylo nebo se nedalo načíst`);
    if (r.full) parts.push(`${r.full} se nevešlo (plné pololetí)`);
    return { ok: true, message: `${parts.join(", ")}. Doplň ke každému cíl a osobní zhodnocení.` };
  } catch (e) {
    return msg(e);
  }
}
