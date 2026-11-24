/**
 * Nastavení umělé inteligence pro celou aplikaci (Google AI / Gemini): pořadí modelů a libovolně mnoho API klíčů.
 * Ukládá se v tabulce app_settings (klíče šifrované), nastavuje se výhradně ve Správě.
 */
import { createHash } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { get, run } from "./db";

export const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

type Stored = { models: (string | { name: string; note?: string })[]; keys: { id: string; enc: string; last4: string; note?: string }[] };
export type AiKey = { id: string; key: string; last4: string; note: string };
export type AiModel = { name: string; note: string };
export type AiConfig = { models: AiModel[]; keys: AiKey[] };

export const keyId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 10);

const none = (): AiConfig => ({ models: DEFAULT_MODELS.map((name) => ({ name, note: "" })), keys: [] });

let memo: { raw: string; cfg: AiConfig } | null = null;

/** Má správce nastavený aspoň jeden klíč? Jen se podívá do nastavení, nic nedešifruje (volá se při každém zobrazení stránky). */
export function hasAiKeys(): boolean {
  const row = get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'ai'");
  if (!row) return false;
  try {
    return ((JSON.parse(row.value) as Stored).keys?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export function getAiConfig(): AiConfig {
  const row = get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'ai'");
  if (!row) return none();
  // dešifrování všech klíčů se opakuje jen při změně nastavení
  if (memo?.raw === row.value) return memo.cfg;
  const cfg = readConfig(row.value);
  memo = { raw: row.value, cfg };
  return cfg;
}

function readConfig(value: string): AiConfig {
  const row = { value };
  try {
    const s = JSON.parse(row.value) as Stored;
    const keys: AiKey[] = [];
    for (const k of s.keys ?? []) {
      try {
        keys.push({ id: k.id, key: decrypt(k.enc), last4: k.last4, note: k.note ?? "" });
      } catch {
        // klíč zašifrovaný jiným APP_SECRET nejde přečíst, přeskočí se
      }
    }
    return { models: s.models?.length ? s.models.map((x) => (typeof x === "string" ? { name: x, note: "" } : { name: x.name, note: x.note ?? "" })) : none().models, keys };
  } catch {
    return none();
  }
}

export function saveAiConfig(models: AiModel[], keys: AiKey[]) {
  const value: Stored = { models, keys: keys.map((k) => ({ id: k.id, enc: encrypt(k.key), last4: k.last4, note: k.note })) };
  run("INSERT INTO app_settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(value));
}
