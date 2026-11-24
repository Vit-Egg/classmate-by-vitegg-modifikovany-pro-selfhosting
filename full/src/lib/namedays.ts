/**
 * Kdo má svátek: z veřejné databáze Nameday API (https://nameday.abalin.net, český kalendář jmen). Žádný vlastní seznam jmen.
 * Odpověď pro daný den se uloží natrvalo (po roce se ptá znovu, kalendář se občas mění), takže se na server posílá nejvýš jeden dotaz za den
 * (služba povoluje 60 dotazů za hodinu). Posílá se jen datum, nic o uživateli. Když služba nejde, svátek se prostě neukáže.
 * Databáze u státních svátků vrací název svátku (třeba „Václav, Den české státnosti“); název se vyřadí a zůstane jen jméno, případně nic.
 */
import { get, run } from "./db";
import { fold } from "./text";

const API = "https://nameday.abalin.net/api/V2/date";
const HOLIDAY = /^(den |nový rok|tři králové|štědrý den|\d\. svátek|svátek |památka |velikonoční|boží )/i;
const failed = new Map<string, number>();

/** Z odpovědi („Václav, Den české státnosti“) nechá jen jména. */
export function namesOnly(raw: string): string {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "n/a" && !HOLIDAY.test(s))
    .join(" a ");
}

/** Jména, která mají v daný den („YYYY-MM-DD“) svátek (prázdné pole, když nikdo nebo služba neodpovídá). */
export async function nameDayNames(iso: string): Promise<string[]> {
  const text = await nameDay(iso);
  return text ? text.replace(/^svátek (má|mají) /, "").split(" a ") : [];
}

/** Slaví člověk dnes svátek? Porovnává se jeho první jméno (bez diakritiky a velikosti písmen). */
export const celebrates = (fullName: string, names: string[]) => {
  const first = fold(fullName.trim().split(/\s+/)[0] ?? "");
  return !!first && names.some((n) => fold(n) === first);
};

/** Věta pro daný den („YYYY-MM-DD“): „svátek má Jana“, „svátek mají Petr a Pavel“, nebo null, když nikdo (nebo služba neodpovídá). */
export async function nameDay(iso: string): Promise<string | null> {
  const key = `nameday:${iso.slice(0, 4)}:${iso.slice(5, 10)}`;
  let names = get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", key)?.value;
  if (names === undefined) {
    if ((failed.get(key) ?? 0) > Date.now()) return null;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Classmate/1.0" },
        body: JSON.stringify({ day: Number(iso.slice(8, 10)), month: Number(iso.slice(5, 7)) }),
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      const j = (await res.json()) as { success?: boolean; data?: { cz?: string } };
      if (!res.ok || !j.success || typeof j.data?.cz !== "string") throw new Error("bad response");
      names = namesOnly(j.data.cz);
      run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", key, names);
    } catch {
      failed.set(key, Date.now() + 10 * 60_000); // 10 minut klid, ať stránka nečeká na výpadek při každém otevření
      return null;
    }
  }
  if (!names) return null;
  return `svátek ${names.includes(" a ") ? "mají" : "má"} ${names}`;
}
