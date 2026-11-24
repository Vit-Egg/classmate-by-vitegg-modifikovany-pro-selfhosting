/** Zapamatované volby zobrazení u účtu (jen povolené klíče a tvary hodnot). */
import { run } from "./db";
import type { User } from "./session";

export const PREFS = {
  cal_view: /^[ma]$/,
  cal_hide: /^[a-z,]{0,80}$/,
  tt_view: /^[vh]$/,
  ai_sum: /^[01]$/,
  ai_chat: /^[a-z]{3,12}$/,
  note_mode: /^[er]$/,
  note_rating: /^[01]$/,
  today_layout: /^([sodtkryzacpuqmbx][lrh],){0,15}[sodtkryzacpuqmbx][lrh]$/,
  horoscope: /^[a-z]{0,12}$/,
  marks_n: /^[01]$/,
  marks_pct: /^[01]$/,
  after_tomorrow: /^[01]$/,
  tt_share: /^[01]$/,
  abs_limit: /^([1-9]\d|)$/,
} as const;
export type PrefKey = keyof typeof PREFS;

export function getPref(user: Pick<User, "ui_prefs">, key: PrefKey): string | undefined {
  try {
    const v = (JSON.parse(user.ui_prefs ?? "{}") as Record<string, unknown>)[key];
    return typeof v === "string" && PREFS[key].test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function setPref(user: Pick<User, "id" | "ui_prefs">, key: string, value: string) {
  if (!(key in PREFS) || !PREFS[key as PrefKey].test(value)) return;
  let cur: Record<string, unknown> = {};
  try {
    cur = JSON.parse(user.ui_prefs ?? "{}");
  } catch {}
  run("UPDATE users SET ui_prefs = ? WHERE id = ?", JSON.stringify({ ...cur, [key]: value }), user.id);
}
