/** Společné části API v1: odpovědi, chyby, ověření tokenem a převod argumentů z query na správné typy. */
import crypto from "node:crypto";
import { authenticateDevice, type AppDevice } from "../app-devices";
import { CORS } from "../oauth";
import { userForToken } from "../oauth";
import type { User } from "../session";

export const API_HEADERS = {
  ...CORS,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, If-None-Match",
  "Access-Control-Expose-Headers": "ETag, X-Request-Id, Retry-After",
  "Cache-Control": "no-store",
};

export const requestId = () => crypto.randomBytes(6).toString("hex");

export function reply(body: unknown, status = 200, rid?: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...API_HEADERS, ...(rid ? { "X-Request-Id": rid } : {}), ...extra } });
}

/** Chyby mají vždy tvar { error: { code, message } }. `code` je stabilní, `message` je česky pro člověka. */
export const fail = (status: number, code: string, message: string, rid?: string, extra: Record<string, string> = {}) => reply({ error: { code, message } }, status, rid, extra);

/** GET odpovědi mají ETag, aplikace může posílat If-None-Match a ušetřit data (304). */
export function replyCached(req: Request, body: unknown, rid: string) {
  const text = JSON.stringify(body);
  const etag = `"${crypto.createHash("sha1").update(text).digest("base64url").slice(0, 22)}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...API_HEADERS, ETag: etag, "X-Request-Id": rid } });
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...API_HEADERS, ETag: etag, "X-Request-Id": rid } });
}

export type Auth = { user: User; device: AppDevice | null; via: "device" | "oauth" };

/** Token zařízení (z přihlášení přes API nebo z aplikace) nebo přístupový token OAuth. Cookie se tu záměrně nepřijímá (kvůli CSRF). */
export function authenticate(req: Request): Auth | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!bearer) return null;
  if (bearer.startsWith("skat_")) {
    const user = userForToken(bearer);
    return user ? { user, device: null, via: "oauth" } : null;
  }
  const a = authenticateDevice(req, 600);
  return a ? { user: a.user, device: a.device, via: "device" } : null;
}

type Prop = { type?: string; items?: { type?: string }; anyOf?: Prop[] };
const kindOf = (p: Prop | undefined): string | undefined => p?.type ?? p?.anyOf?.map(kindOf).find((k) => k && k !== "null");

/** Hodnoty z query string jsou texty, tak je podle schématu nástroje převedeme na čísla, pravdivostní hodnoty a pole. */
export function coerce(raw: Record<string, string[]>, props: Record<string, Prop>) {
  const out: Record<string, unknown> = {};
  for (const [k, vals] of Object.entries(raw)) {
    const kind = kindOf(props[k]);
    const one = vals[0];
    if (kind === "integer" || kind === "number") out[k] = one !== "" && !Number.isNaN(Number(one)) ? Number(one) : one;
    else if (kind === "boolean") out[k] = one === "true" || one === "1" ? true : one === "false" || one === "0" ? false : one;
    else if (kind === "array") out[k] = vals.flatMap((v) => v.split(",")).filter(Boolean);
    else out[k] = one;
  }
  return out;
}

/** Čísla z cesty (/tasks/12) se převedou podle schématu stejně jako query. */
export const coercePath = (params: Record<string, string>, props: Record<string, Prop>) => coerce(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, [v]])), props);
