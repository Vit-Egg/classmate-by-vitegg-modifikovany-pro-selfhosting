"use server";

import { revalidatePath } from "next/cache";
import { rotateEmbedKey } from "@/lib/embed/core";
import { requireAdmin } from "@/lib/session";

/** Nový klíč widgetů: staré adresy widgetů a manifestu přestanou platit. */
export async function rotateWidgetKey() {
  await requireAdmin();
  rotateEmbedKey();
  revalidatePath("/widgety");
}
