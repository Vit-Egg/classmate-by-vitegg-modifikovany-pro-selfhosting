"use server";

import { redirect } from "next/navigation";
import { requestReset, resetPassword } from "@/lib/password-reset";
import { clientIp } from "@/lib/session";
import type { ActionState } from "@/lib/action";

const SENT = "Pokud k tomuhle e-mailu existuje účet, poslali jsme na něj odkaz na obnovení hesla. Zkontroluj i spam.";

export async function requestResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const err = await requestReset(String(fd.get("email") ?? ""), await clientIp());
  return err ? { error: err } : { ok: true, message: SENT };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("password2") ?? "")) return { error: "Hesla se neshodují." };
  const err = await resetPassword(String(fd.get("t") ?? ""), pw);
  if (err) return { error: err };
  redirect("/prihlaseni?reset=1");
}
