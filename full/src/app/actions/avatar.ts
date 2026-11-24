"use server";

import { revalidatePath } from "next/cache";
import { removeAvatar } from "@/lib/avatar";
import { requireAdmin, requireUser } from "@/lib/session";

/** Vlastní profilovku odebere kdokoli. */
export async function removeMyAvatar() {
  const user = await requireUser();
  removeAvatar(user.id);
  revalidatePath("/", "layout");
}

/** Cizí profilovku (třeba nevhodnou fotku) smaže správce. */
export async function removeUserAvatar(fd: FormData) {
  await requireAdmin();
  removeAvatar(Number(fd.get("user")));
  revalidatePath("/", "layout");
}
