import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Vrátí číslo kroku (30 s), ve kterém kód platí, nebo null. Okno ±1 krok. */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(hotp(secret, s));
    const given = Buffer.from(code);
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return s;
  }
  return null;
}

export const otpauthUri = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent("Classmate:" + email)}?secret=${secret}&issuer=${encodeURIComponent("Classmate")}&digits=6&period=30`;
