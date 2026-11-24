/** Vzhled stránky Dnes: co se ukazuje, v jakém pořadí a ve kterém sloupci. Ukládá se jako např. „sl,ol,dl,tr,kr,rl,zh“ (písmeno panelu + sloupec l/r, h = skryté). */
export const WIDGETS = [
  { id: "r", label: "Osa dne a věta pod pozdravem", col: "l" },
  { id: "s", label: "Dnešní rozvrh", col: "l" },
  { id: "o", label: "Oběd", col: "l" },
  { id: "d", label: "Třídní služba", col: "h" },
  { id: "t", label: "Nejbližší testy a zkoušení", col: "r" },
  { id: "k", label: "Úkoly", col: "r" },
  { id: "y", label: "Zítřejší rozvrh", col: "h" },
  { id: "z", label: "Poslední známky", col: "h" },
  { id: "a", label: "Absence", col: "h" },
  { id: "c", label: "Kalendář na týden", col: "h" },
  { id: "p", label: "Poznámky", col: "h" },
  { id: "u", label: "Zprávy", col: "h" },
  { id: "q", label: "Komens", col: "h" },
  { id: "m", label: "Pokladna", col: "h" },
  { id: "b", label: "Rychlé akce", col: "h" },
  { id: "x", label: "Denní horoskop", col: "h" },
] as const;

export type Col = "l" | "r" | "h";
export type LayoutItem = { id: string; col: Col };

const DEFAULT: LayoutItem[] = [
  { id: "r", col: "l" },
  { id: "s", col: "l" },
  { id: "o", col: "l" },
  { id: "d", col: "h" }, // třídní služba je ve výchozím stavu skrytá, zapne se v Upravit stránku
  { id: "t", col: "r" },
  { id: "k", col: "r" },
  // nové panely jsou ve výchozím stavu skryté, ať se stránka po aktualizaci nikomu nezmění; zapnou se v Upravit stránku
  { id: "y", col: "h" },
  { id: "z", col: "h" },
  { id: "a", col: "h" },
  { id: "c", col: "h" },
  { id: "p", col: "h" },
  { id: "u", col: "h" },
  { id: "q", col: "h" },
  { id: "m", col: "h" },
  { id: "b", col: "h" },
  { id: "x", col: "h" },
];

/** Přečte uloženou volbu. Neznámé nebo chybějící panely se doplní výchozími, takže nový panel se po aktualizaci nikdy neztratí. */
export function parseLayout(raw: string | undefined): LayoutItem[] {
  const out: LayoutItem[] = [];
  const seen = new Set<string>();
  for (const t of raw ? raw.split(",") : []) {
    const id = t[0];
    const col = t[1] as Col;
    if (WIDGETS.some((w) => w.id === id) && (col === "l" || col === "r" || col === "h") && !seen.has(id)) {
      out.push({ id, col });
      seen.add(id);
    }
  }
  for (const d of DEFAULT) if (!seen.has(d.id)) out.push(d);
  return out;
}

export const serializeLayout = (l: LayoutItem[]) => l.map((x) => `${x.id}${x.col}`).join(",");
export const defaultLayout = () => DEFAULT.map((x) => ({ ...x }));
