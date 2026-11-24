/** Bez diakritiky a velikosti písmen, ale se zachovanou délkou (kvůli výřezům textu). */
export const fold = (s: string) => [...s].map((c) => c.normalize("NFD")[0].toLowerCase()).join("");

export function snippet(text: string, q: string, len = 180) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!q) return flat.slice(0, len);
  const at = fold(flat).indexOf(q);
  if (at < 0) return flat.slice(0, len);
  const from = Math.max(0, at - 50);
  return (from ? "…" : "") + flat.slice(from, from + len);
}
