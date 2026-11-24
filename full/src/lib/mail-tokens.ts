/** Podepsané odkazy v e-mailech (potvrzení adresy, odhlášení). Bez databáze: podpis drží tajný klíč aplikace. */
import crypto from "node:crypto";
import { hmac } from "./crypto";

type Payload = { p: "confirm" | "unsub" | "reset" | "boardmail"; u: number; e?: string; /** otisk hesla: po změně hesla odkaz přestane platit */ h?: string; x: number };

export function signToken(p: Omit<Payload, "x">, ttlMs: number) {
  const body = Buffer.from(JSON.stringify({ ...p, x: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${hmac(body).slice(0, 32)}`;
}

export function verifyToken(token: string, purpose: Payload["p"]): Payload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = hmac(body).slice(0, 32);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    return p.p === purpose && p.x > Date.now() ? p : null;
  } catch {
    return null;
  }
}
