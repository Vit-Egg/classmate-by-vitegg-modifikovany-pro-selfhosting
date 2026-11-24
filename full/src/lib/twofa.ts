import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { decrypt, sha256 } from "./crypto";
import { verifyTotp } from "./totp";

const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

const normalizeCode = (c: string) => c.toLowerCase().replace(/[\s-]/g, "");

export function generateRecoveryCodes(userId: number) {
  const codes = Array.from({ length: 10 }, () => {
    const raw = Array.from(crypto.randomBytes(10), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  tx(() => {
    run("DELETE FROM recovery_codes WHERE user_id = ?", userId);
    for (const c of codes) run("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)", userId, sha256(normalizeCode(c)));
  });
  return codes;
}

export const remainingRecoveryCodes = (userId: number) =>
  get<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL", userId)?.n ?? 0;

/** Ověří TOTP kód (s ochranou proti opakovanému použití) nebo jednorázový záložní kód. */
export function verifySecondFactor(userId: number, input: string) {
  const user = get<{ totp_secret_enc: string | null; totp_last_step: number }>("SELECT totp_secret_enc, totp_last_step FROM users WHERE id = ?", userId);
  if (!user?.totp_secret_enc) return false;
  const code = input.trim();
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(decrypt(user.totp_secret_enc), code);
    if (step == null || step <= user.totp_last_step) return false;
    run("UPDATE users SET totp_last_step = ? WHERE id = ?", step, userId);
    return true;
  }
  const hash = sha256(normalizeCode(code));
  const row = all<{ id: number }>("SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL", userId, hash)[0];
  if (!row) return false;
  run("UPDATE recovery_codes SET used_at = ? WHERE id = ?", Date.now(), row.id);
  return true;
}
