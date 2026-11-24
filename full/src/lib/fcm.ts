/**
 * Push do mobilní aplikace přes Firebase Cloud Messaging (HTTP v1). Bez dalších knihoven: přístupový token se podepíše
 * účtem služby (RS256) přes node:crypto. Účet služby se zadá v FCM_SERVICE_ACCOUNT (cesta k JSON nebo samotný JSON)
 * nebo se najde v data/.fcm.json. Bez něj je FCM vypnuté a zbytek aplikace funguje beze změny.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

type Account = { project_id: string; client_email: string; private_key: string };
let account: Account | null | undefined;
let cached: { value: string; exp: number } | null = null;

function load(): Account | null {
  if (account !== undefined) return account;
  account = null;
  try {
    const raw = (process.env.FCM_SERVICE_ACCOUNT ?? "").trim();
    const file = path.join(dataDir(), ".fcm.json");
    const text = raw ? (raw.startsWith("{") ? raw : fs.readFileSync(raw, "utf8")) : fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (text) {
      const a = JSON.parse(text) as Account;
      if (a.project_id && a.client_email && a.private_key) account = a;
      else console.error("FCM: účet služby nemá project_id, client_email a private_key.");
    }
  } catch (e) {
    console.error("FCM: účet služby se nepodařilo načíst", e);
  }
  return account;
}

export const fcmEnabled = () => !!load();

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function accessToken(a: Account): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.value;
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(a.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { value: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

/** ok = doručeno Firebase, gone = token zařízení už neplatí (404 UNREGISTERED), error = dočasná nebo jiná chyba (nic se nemaže). */
export async function sendFcm(token: string, data: Record<string, string>): Promise<"ok" | "gone" | "error"> {
  const a = load();
  if (!a) return "error";
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(a)}`, "Content-Type": "application/json" },
      // datová zpráva s vysokou prioritou: oznámení sestaví aplikace sama (vzhled, kanál, cílová stránka)
      body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "43200s" } } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "ok";
    if (res.status === 404 || res.status === 410) return "gone";
    console.error("FCM send failed", res.status);
    return "error";
  } catch (e) {
    console.error("FCM send failed", e);
    return "error";
  }
}
