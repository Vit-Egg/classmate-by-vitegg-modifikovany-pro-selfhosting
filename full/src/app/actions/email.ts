"use server";

import { redirect } from "next/navigation";
import { confirmEmail } from "@/lib/email-notify";
import { verifyToken } from "@/lib/mail-tokens";

export async function confirmEmailAction(fd: FormData) {
  const t = String(fd.get("t") ?? "");
  const p = verifyToken(t, "confirm");
  if (!p || !p.e || !confirmEmail(p.u, p.e)) redirect(`/potvrdit-email?t=${encodeURIComponent(t)}`);
  redirect("/potvrdit-email?ok=1");
}
