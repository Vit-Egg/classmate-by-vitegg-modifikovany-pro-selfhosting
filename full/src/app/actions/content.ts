"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { ServiceError, createTask as svcCreateTask, createTest as svcCreateTest, deleteTask as svcDeleteTask, deleteTest as svcDeleteTest, setTaskDone, updateTask as svcUpdateTask, updateTest as svcUpdateTest } from "@/lib/services";
import type { ActionState } from "@/lib/action";
import { setAttend } from "@/lib/content";

async function guard(fn: () => void): Promise<ActionState> {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(() => svcCreateTask(user, { title: fd.get("title"), subject: fd.get("subject"), due: fd.get("due"), note: fd.get("note"), private: fd.get("private") }));
}

export async function createTest(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(() => svcCreateTest(user, { subject: fd.get("subject"), date: fd.get("date"), topic: fd.get("topic"), repeat: fd.get("repeat"), until: fd.get("until"), outsideLesson: fd.get("outside"), private: fd.get("private"), makeup: fd.get("makeup"), oral: fd.get("oral") }));
}

export async function toggleTask(fd: FormData) {
  const user = await requireUser();
  await guard(() => void setTaskDone(user, Number(fd.get("id"))));
}

export async function deleteTask(fd: FormData) {
  const user = await requireUser();
  await guard(() => svcDeleteTask(user, Number(fd.get("id"))));
}

export async function deleteTest(fd: FormData) {
  const user = await requireUser();
  await guard(() => svcDeleteTest(user, Number(fd.get("id"))));
}

export async function updateTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(() => svcUpdateTask(user, Number(fd.get("id")), { title: fd.get("title"), due: fd.get("due"), note: fd.get("note") }));
}

export async function updateTest(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return guard(() => svcUpdateTest(user, Number(fd.get("id")), { date: fd.get("date"), topic: fd.get("topic"), outsideLesson: fd.get("outside"), makeup: fd.get("makeup"), oral: fd.get("oral") }));
}

/** Náhradní termín: píšu (1), nepíšu (0), nebo zpět na nerozhodnuto (prázdné). */
export async function setTestAttend(fd: FormData) {
  const user = await requireUser();
  const v = String(fd.get("writes") ?? "");
  setAttend(user.id,user.class_id, Number(fd.get("id")), v === "1" ? true : v === "0" ? false : null);
  revalidatePath("/", "layout");
}
