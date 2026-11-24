import { addDays, mondayOf } from "./dates";

/** Hodnota filtru „do kdy“ (předvolba nebo datum) → poslední zahrnutý den, nebo null bez omezení. */
export function untilDate(value: string | undefined, today: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === "tyden") return addDays(mondayOf(today), 6);
  if (value === "14d") return addDays(today, 14);
  if (value === "mesic") return addDays(today, 31);
  return null;
}
