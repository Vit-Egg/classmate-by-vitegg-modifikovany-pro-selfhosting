/**
 * Seznam studentů třídy (classes.roster, jedno jméno na řádek). Do třídy se dá zaregistrovat jen člověk, jehož jméno z Bakalářů v seznamu je;
 * dokud je seznam prázdný, třída přijímá všechny studenty z Bakalářů (viz registerAction).
 * Každé jméno ze seznamu, které ještě nemá účet, má v databázi „neregistrovaného člena“ (users.placeholder = 1), takže se počítá do plateb, služeb
 * i seznamu spolužáků; po registraci se tenhle řádek přepíše na skutečný účet a zůstane mu historie. Seznam spravuje správce ve Správě.
 */
import { randomUUID } from "node:crypto";
import { all, get, run, tx } from "./db";
import { fold } from "./text";
import { addToOpenRequests } from "./cash";

export class RosterError extends Error {}

/** Klíč jména: bez diakritiky, velikosti písmen, interpunkce a pořadí slov („Novák Jan“ = „jan novak“). */
export const nameKey = (name: string) =>
  fold(name.replace(/\s*,\s*\d{1,2}\s*\.?\s*[A-Za-z]{0,2}\s*$/, ""))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(" ");

/** Řádek může přejmenovat člověka: „Starý název > Nový název“ (také → nebo ->). Platí pak nový název. */
const RENAME = /\s*(?:->|=>|→|>)\s*/;
/** Třída připsaná za jménem po čárce („Novák Jan, 1.B“): do jména nepatří. */
const CLASS_SUFFIX = /\s*,\s*\d{1,2}\s*\.?\s*[A-Za-z]{0,2}\s*$/;
const clean = (l: string) => l.replace(/^\s*(?:\d+[.)]|[-*•–])\s*/, "").replace(/\s+/g, " ").replace(CLASS_SUFFIX, "").trim();

/**
 * Jméno z Bakalářů do podoby, v jaké se ukazuje v aplikaci. Bakaláři někdy vrací „Příjmení Jméno, 1.B“ (se třídou a příjmením napřed):
 * třída se odřízne a pořadí se obrátí na „Jméno Příjmení“. Jméno bez třídy se nechává přesně tak, jak je v Bakalářích.
 */
export function bakalariName(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const base = text.replace(CLASS_SUFFIX, "").trim();
  if (base === text) return text.slice(0, 100);
  const w = base.split(" ");
  return (w.length >= 2 ? [...w.slice(1), w[0]].join(" ") : base).slice(0, 100);
}

/** Jména ze seznamu: bez prázdných řádků, odrážek a číslování, s jednou mezerou mezi slovy (u přejmenování ten nový). */
export function parseRoster(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => clean(l.split(RENAME).slice(-1)[0] ?? ""))
    .filter(Boolean);
}

/** Přejmenování zadaná v seznamu řádky „Starý > Nový“. */
export function parseRenames(text: string): { from: string; to: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(RENAME))
    .filter((p) => p.length === 2)
    .map(([a, b]) => ({ from: clean(a), to: clean(b) }))
    .filter((r) => r.from && r.to);
}

export const rosterOf = (classId: number) => parseRoster(get<{ roster: string }>("SELECT roster FROM classes WHERE id = ?", classId)?.roster ?? "");

export type RosterMatch = { kind: "ok"; name: string } | { kind: "none" } | { kind: "ambiguous" };

/**
 * Najde ve třídě jméno z Bakalářů. Napřed přesná shoda (bez ohledu na pořadí a diakritiku), potom jediné jméno, jehož slova jsou celá obsažená
 * ve jménu z Bakalářů (nebo naopak), třeba kvůli druhému křestnímu jménu. Víc možností znamená nejednoznačné, tam se raději neregistruje.
 */
export function matchRoster(classId: number, fullName: string): RosterMatch {
  return matchIn(rosterOf(classId), fullName);
}

function matchIn(names: string[], fullName: string): RosterMatch {
  const key = nameKey(fullName);
  if (!key) return { kind: "none" };
  const exact = names.filter((n) => nameKey(n) === key);
  if (exact.length === 1) return { kind: "ok", name: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous" };
  const words = new Set(key.split(" "));
  const loose = names.filter((n) => {
    const w = nameKey(n).split(" ");
    return w.length >= 2 && (w.every((x) => words.has(x)) || (words.size >= 2 && [...words].every((x) => w.includes(x))));
  });
  return loose.length === 1 ? { kind: "ok", name: loose[0] } : loose.length > 1 ? { kind: "ambiguous" } : { kind: "none" };
}

/** Člen třídy (účet i neregistrovaný) se stejným jménem jako řádek seznamu. */
export const memberNamed = (classId: number, ...names: string[]) => {
  const keys = names.map(nameKey);
  return all<{ id: number; name: string; placeholder: number }>("SELECT id, name, placeholder FROM users WHERE class_id = ?", classId).find((u) => keys.includes(nameKey(u.name)));
};

/**
 * Uloží seznam třídy. Nepovolí ho, když v něm chybí někdo, kdo už v aplikaci je, nebo když je jméno dvakrát.
 * Pak srovná neregistrované členy: jména bez účtu přidá, jména ze seznamu odstraněná smaže (i s jejich platbami a službami).
 */
export function saveRoster(classId: number, text: string): { added: number; removed: number; total: number } {
  if (!get("SELECT 1 FROM classes WHERE id = ?", classId)) throw new RosterError("Třída neexistuje.");
  const names = parseRoster(text);
  if (names.length > 200) throw new RosterError("Seznam má moc jmen (nejvýš 200).");
  for (const n of names) {
    if (n.length < 2 || n.length > 100) throw new RosterError(`Jméno „${n.slice(0, 40)}“ má špatnou délku (2 až 100 znaků).`);
    if (nameKey(n).split(" ").length < 2) throw new RosterError(`„${n}“ má jen jedno slovo, napiš jméno i příjmení.`);
  }
  const seen = new Map<string, string>();
  const dups: string[] = [];
  for (const n of names) {
    const k = nameKey(n);
    if (seen.has(k)) dups.push(n);
    seen.set(k, n);
  }
  if (dups.length) throw new RosterError(`Jméno je v seznamu víckrát: ${[...new Set(dups)].join(", ")}.`);

  const members = all<{ id: number; name: string; placeholder: number }>("SELECT id, name, placeholder FROM users WHERE class_id = ?", classId);
  // přejmenování („Starý > Nový“): člen se najde podle starého jména a dál platí pod novým
  const renames = new Map<number, string>();
  for (const r of parseRenames(text)) {
    const m = members.find((x) => nameKey(x.name) === nameKey(r.from));
    if (!m) throw new RosterError(`Nejde přejmenovat „${r.from}“: ve třídě takový člověk není.`);
    renames.set(m.id, r.to);
  }
  const current = members.map((m) => ({ ...m, name: renames.get(m.id) ?? m.name }));
  // účet se k řádku seznamu přiřadí podle jména (na pořadí slov nezáleží; stejně jako při registraci i když má jedno jméno navíc)
  const rowFor = (name: string) => {
    const hit = matchIn(names, name);
    return hit.kind === "ok" ? nameKey(hit.name) : undefined;
  };
  const missing = current.filter((m) => !m.placeholder && rowFor(m.name) === undefined);
  if (missing.length) throw new RosterError(`V seznamu chybí lidé, kteří už v aplikaci jsou: ${missing.map((m) => m.name).join(", ")}. Doplň je, jinak seznam nejde uložit.`);

  const school = get<{ school_id: number }>("SELECT school_id FROM classes WHERE id = ?", classId)!.school_id;
  let added = 0;
  let removed = 0;
  tx(() => {
    run("UPDATE classes SET roster = ? WHERE id = ?", names.join("\n"), classId);
    const have = new Set<string>();
    for (const m of current) {
      if (!m.placeholder) {
        // účet: jméno je z Bakalářů a seznam ho nepřepisuje, seznam jen říká, že tenhle člověk už v něm je (jen výslovné přejmenování „Starý > Nový“ se provede)
        const k = rowFor(m.name);
        if (k !== undefined) have.add(k);
        if (renames.has(m.id)) run("UPDATE users SET name = ? WHERE id = ?", m.name, m.id);
        continue;
      }
      const text = seen.get(nameKey(m.name));
      if (text === undefined) {
        run("DELETE FROM users WHERE id = ? AND placeholder = 1", m.id);
        removed++;
        continue;
      }
      have.add(nameKey(m.name));
      // člen bez účtu se ukazuje tak, jak je napsaný v seznamu
      if (m.name !== text) run("UPDATE users SET name = ? WHERE id = ?", text, m.id);
    }
    for (const [k, n] of seen) {
      if (have.has(k)) continue;
      const id = Number(run("INSERT INTO users (email, name, password_hash, role, school_id, class_id, created_at, placeholder) VALUES (?, ?, '!', 'user', ?, ?, ?, 1)", `neregistrovany-${randomUUID()}@bez-uctu.invalid`, n, school, classId, Date.now()).lastInsertRowid);
      addToOpenRequests(classId, id);
      added++;
    }
  });
  return { added, removed, total: names.length };
}

/** Změna jména v seznamu (u přejmenování člena nebo přesunu): odebere řádek se starým jménem. */
export function rosterRemove(classId: number, name: string) {
  const key = nameKey(name);
  const rest = rosterOf(classId).filter((n) => nameKey(n) !== key);
  run("UPDATE classes SET roster = ? WHERE id = ?", rest.join("\n"), classId);
}

/** Přidá jméno na konec seznamu, když tam ještě není. */
export function rosterAdd(classId: number, name: string) {
  const names = rosterOf(classId);
  if (names.some((n) => nameKey(n) === nameKey(name))) return;
  run("UPDATE classes SET roster = ? WHERE id = ?", [...names, name].join("\n"), classId);
}
