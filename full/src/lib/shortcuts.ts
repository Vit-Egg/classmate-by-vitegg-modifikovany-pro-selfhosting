/** Jednoklávesové zkratky: výchozí klávesy a pravidla pro vlastní. Společné pro server i prohlížeč. */
export type ShortcutId = "dnes" | "rozvrh" | "kalendar" | "ukoly" | "testy" | "predmety" | "poznamky" | "znamky" | "absence" | "sprava" | "nastaveni" | "zpravy" | "novy" | "hledat";

export const SHORTCUTS: { id: ShortcutId; label: string; key: string; href?: string; admin?: boolean }[] = [
  { id: "dnes", label: "Dnes", key: "d", href: "/dnes" },
  { id: "rozvrh", label: "Rozvrh", key: "r", href: "/rozvrh" },
  { id: "kalendar", label: "Kalendář", key: "k", href: "/kalendar" },
  { id: "ukoly", label: "Úkoly", key: "u", href: "/ukoly" },
  { id: "testy", label: "Testy a zkoušení", key: "t", href: "/testy-a-zkouseni" },
  { id: "predmety", label: "Předměty", key: "e", href: "/predmety" },
  { id: "poznamky", label: "Poznámky", key: "p", href: "/poznamky" },
  { id: "znamky", label: "Známky", key: "z", href: "/znamky" },
  { id: "absence", label: "Absence", key: "a", href: "/absence" },
  { id: "sprava", label: "Správa", key: "s", href: "/sprava", admin: true },
  { id: "nastaveni", label: "Nastavení", key: ",", href: "/nastaveni" },
  { id: "zpravy", label: "Zprávy (zvoneček)", key: "m" },
  { id: "novy", label: "Nový úkol, test nebo zkoušení, nebo poznámka (na jejich stránce)", key: "n" },
  { id: "hledat", label: "Hledání na stránce", key: "/" },
];

export type KeyMap = Record<ShortcutId, string>;
const DEFAULTS = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.key])) as KeyMap;

/** Klávesy uložené u uživatele (JSON jen s odchylkami od výchozích) složené s výchozími. */
export function resolveKeys(stored?: string | null): KeyMap {
  const out = { ...DEFAULTS };
  if (!stored) return out;
  try {
    const custom = JSON.parse(stored) as Record<string, unknown>;
    for (const s of SHORTCUTS) if (typeof custom[s.id] === "string" && custom[s.id]) out[s.id] = custom[s.id] as string;
  } catch {}
  return out;
}

/** `?` je napevno nápověda, mezera a řídicí znaky nejdou. Vrací chybu, nebo null. */
export function checkKey(key: string): string | null {
  if (key.length !== 1 || /\s/.test(key)) return "Zkratka je jedna klávesa.";
  if (key === "?") return "Klávesa ? je napevno nápověda.";
  return null;
}

export function validateKeys(map: KeyMap): string | null {
  const seen = new Map<string, string>();
  for (const s of SHORTCUTS) {
    const k = map[s.id];
    const bad = typeof k === "string" ? checkKey(k) : "Chybí klávesa.";
    if (bad) return `${s.label}: ${bad}`;
    const other = seen.get(k.toLowerCase());
    if (other) return `Klávesa ${k} je už u položky „${other}“.`;
    seen.set(k.toLowerCase(), s.label);
  }
  return null;
}
