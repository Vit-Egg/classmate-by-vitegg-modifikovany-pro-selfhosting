"use server";

import { redirect } from "next/navigation";
import { createCode, validateAuthRequest } from "@/lib/oauth";
import { requireUser } from "@/lib/session";

const fields = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state"] as const;
const read = (fd: FormData) => Object.fromEntries(fields.map((k) => [k, (fd.get(k) as string | null) ?? undefined]));

function back(uri: string, params: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

export async function approveAuthorization(fd: FormData) {
  const user = await requireUser();
  if (user.demo) redirect("/nastaveni");
  const req = validateAuthRequest(read(fd));
  if ("error" in req) redirect("/");
  const code = createCode(req.client.id, user.id, req.redirectUri, req.challenge);
  redirect(back(req.redirectUri, { code, state: req.state }));
}

export async function denyAuthorization(fd: FormData) {
  await requireUser();
  const req = validateAuthRequest(read(fd));
  if ("error" in req) redirect("/");
  redirect(back(req.redirectUri, { error: "access_denied", state: req.state }));
}
