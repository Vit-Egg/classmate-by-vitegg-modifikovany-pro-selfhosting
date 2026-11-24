/**
 * Veřejné demo: kdokoli si může aplikaci vyzkoušet bez registrace. Každý návštěvník dostane vlastní ukázkovou třídu (vymyšlení spolužáci,
 * rozvrh, známky, úkoly, testy, poznámky, zprávy i jídelníček), do které smí normálně psát. Nic z toho se nemíchá se skutečnými daty
 * a po DEMO_HOURS hodinách (výchozí 24) se celá třída i s účtem smaže. Vypnout jde přes DEMO_PUBLIC=off.
 * Účty dema mají users.demo = 1 (návštěvník) nebo 2 (vymyšlený spolužák, nejde se za něj přihlásit) a ukázková škola má schools.demo = 1,
 * takže se neukazují v registraci, ve Správě ani ve statistikách.
 */
import { encrypt, hashPassword, randomToken } from "./crypto";
import { all, get, run, tx } from "./db";
import { notify } from "./messages";
import { markdownToDoc, docToText } from "./markdown";
import { createNote, setNoteShared } from "./services";
import { mapSubjects } from "./sync";
import { timetable, seedContent } from "./demo";
import { purgeUserAudio } from "./audio";
import { purgeUserImages } from "./images";
import { purgeUserFiles } from "./note-files";
import { USER_SELECT, type User } from "./session";
import { DEMO_CANTEEN } from "./strava";

export const demoPublicEnabled = () => !/^(0|off|false|no)$/i.test((process.env.DEMO_PUBLIC ?? "").trim());
export const demoHours = () => {
  const n = Number(process.env.DEMO_HOURS);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 14) : 24;
};
const demoMax = () => {
  const n = Number(process.env.DEMO_MAX);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 300;
};

export class DemoError extends Error {}

/** Kolik návštěvníků má právě aktivní demo. */
export const activeDemos = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE demo = 1 AND demo_expires_at IS NOT NULL AND demo_expires_at > ?", Date.now())?.n ?? 0;

const MATES = ["Anna Nováková", "Tomáš Dvořák", "Eliška Svobodová", "Jakub Černý", "Karolína Procházková"];

let lockedHash: string | null = null;
/** Heslo, které nikdo nezná (vymyšlený spolužák a účet návštěvníka nemají přihlášení heslem). */
const locked = () => (lockedHash ??= hashPassword(randomToken(32)));

const NOTE_WELCOME = `# Vítej v demu Classmate

Tohle je ukázková poznámka. Všechno, co v demu vidíš, je **vymyšlené**, a po ${"{h}"} hodinách se to samo smaže.

## Co si zkus

- Napiš poznámku k hodině a přiřaď ji k předmětu.
- Zkus vzorec: napiš $\\frac{1}{2}+\\frac{1}{3}=$ a stiskni Tab.
- Podívej se do **Rozvrhu**, **Známek** (včetně předvídače průměru), **Testů a zkoušení** a **Spolužáků**.
- Objednej si oběd v **Obědech**.
- Přidej úkol nebo test, ostatní spolužáci z dema ho uvidí.

Až tě demo přesvědčí, vytvoř si skutečný účet (nahoře v liště).`;

const NOTE_MATH = `# Rovnice a nerovnice

## Lineární rovnice

Rovnici $ax+b=0$ vyřešíme úpravou: $x=-\\frac{b}{a}$.

- převedeme neznámé na jednu stranu
- vydělíme koeficientem

## Příklad

$$2x+6=14 \\Rightarrow x=4$$`;

const NOTE_PHYSICS = `# Mechanika: síla a pohyb

Newtonův druhý zákon: $F=m\\cdot a$.

- síla se měří v newtonech (N)
- zrychlení v m/s²
- na těleso o hmotnosti 2 kg působí síla 10 N, takže zrychlení je 5 m/s²`;

function note(user: User, title: string, md: string, subjectBk: string | null) {
  const doc = markdownToDoc(md.replace("{h}", String(demoHours())));
  const subject = subjectBk ? get<{ id: number }>("SELECT id FROM subjects WHERE class_id = ? AND bk_id = ?", user.class_id, subjectBk)?.id : undefined;
  return createNote(user, { title, content: JSON.stringify(doc), text: docToText(doc), subject });
}

/** Založí demo pro nového návštěvníka a vrátí id jeho účtu. */
export function createVisitorDemo(): number {
  if (!demoPublicEnabled()) throw new DemoError("Demo je na tomhle serveru vypnuté.");
  if (activeDemos() >= demoMax()) throw new DemoError("Demo je teď plné, zkus to za chvíli.");
  const now = Date.now();
  const expires = now + demoHours() * 3600_000;
  const tag = randomToken(6).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || String(now);
  let userId = 0;
  tx(() => {
    const school = get<{ id: number }>("SELECT id FROM schools WHERE name = 'Demo škola' AND bakalari_url IS NULL") ?? { id: Number(run("INSERT INTO schools (name, bakalari_url, created_at, demo) VALUES ('Demo škola', NULL, ?, 1)", now).lastInsertRowid) };
    run("UPDATE schools SET demo = 1 WHERE id = ?", school.id);
    const cls = Number(run("INSERT INTO classes (school_id, name) VALUES (?, ?)", school.id, `Demo ${tag.slice(0, 4).toUpperCase()}`).lastInsertRowid);
    const add = (email: string, name: string, kind: 1 | 2, i: number) =>
      Number(
        run(
          "INSERT INTO users (email, name, password_hash, role, school_id, class_id, bakalari_username, bakalari_refresh_enc, share_marks_stats, created_at, demo, demo_expires_at, ui_prefs) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, 0, ?, ?, ?, NULL)",
          email, name, locked(), school.id, cls, `demo-${tag}-${i}`, kind === 1 ? encrypt("demo") : null, now - i * 86_400_000, kind, expires,
        ).lastInsertRowid,
      );
    userId = add(`demo-${tag}@demo.invalid`, "Demo Student", 1, 0);
    MATES.forEach((name, i) => add(`demo-${tag}-${i + 1}@demo.invalid`, name, 2, i + 1));
  });

  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, userId)!;
  const mates = all<User>(`${USER_SELECT} WHERE u.class_id = ? AND u.demo = 2 ORDER BY u.id`, user.class_id);
  const tt = timetable(null);
  tx(() => {
    mapSubjects(user, tt);
    for (const m of mates) mapSubjects(m, tt);
    seedContent(user, [user.id, ...mates.slice(0, 3).map((m) => m.id)]);
    run("UPDATE users SET socials = ? WHERE id = ?", JSON.stringify({ instagram: "anna.novakova" }), mates[0].id);
    run("UPDATE users SET socials = ? WHERE id = ?", JSON.stringify({ discord: "tomas_d", github: "tomasdvorak" }), mates[1].id);
    run("INSERT INTO strava_accounts (user_id, username, password_enc, created_at, canteen) VALUES (?, 'demo', ?, ?, ?)", user.id, encrypt("demo"), now, DEMO_CANTEEN);

    const welcome = note(user, "Vítej v demu Classmate", NOTE_WELCOME, null);
    run("UPDATE notes SET pinned = 1 WHERE id = ?", welcome);
    note(user, "Rovnice a nerovnice", NOTE_MATH, "m");
    // sdílené poznámky vymyšlených spolužáků, aby bylo co číst
    const shared = (m: User, title: string, md: string, bk: string) => setNoteShared(m, note(m, title, md, bk), true);
    shared(mates[0], "Mechanika: síla a pohyb", NOTE_PHYSICS, "f");
    shared(mates[1], "Rovnice a nerovnice: shrnutí", NOTE_MATH.replace("# Rovnice a nerovnice", "# Shrnutí před testem"), "m");

    const msg = (key: string, category: "system" | "marks" | "timetable" | "classwork", title: string, body: string, link: string) => notify(user.id, { category, title, body, link, key, silent: true });
    msg("demo:welcome", "system", "Vítej v demu", "Všechna data jsou vymyšlená. Zkus poznámky, rozvrh, známky nebo oběd.", "/poznamky");
    msg("demo:mark", "marks", "Nová známka: Matematika", "Písemka: rovnice, 1", "/znamky");
    msg("demo:change", "timetable", "Změna v rozvrhu", "Ve středu 4. hodinu je suplování (Zeměpis).", "/rozvrh");
    msg("demo:task", "classwork", "Nový úkol od spolužáka", `${mates[0].name}: Příklady 4 až 9 ze cvičebnice`, "/ukoly");
  });
  return userId;
}

/** Smaže ukázkové třídy, kterým vypršel čas (účet návštěvníka, vymyšlení spolužáci, poznámky, nahrávky a obrázky). Vrací počet smazaných dem. */
export function purgeExpiredDemos(): number {
  const now = Date.now();
  const expired = all<{ id: number; class_id: number }>("SELECT id, class_id FROM users WHERE demo = 1 AND demo_expires_at IS NOT NULL AND demo_expires_at < ?", now);
  for (const u of expired) {
    try {
      const ids = all<{ id: number }>("SELECT id FROM users WHERE class_id = ? AND demo IN (1, 2)", u.class_id).map((r) => r.id);
      for (const id of ids) {
        purgeUserAudio(id);
        purgeUserImages(id);
        purgeUserFiles(id);
      }
      tx(() => {
        run("DELETE FROM users WHERE class_id = ? AND demo IN (1, 2)", u.class_id);
        if (!get("SELECT 1 FROM users WHERE class_id = ? LIMIT 1", u.class_id)) run("DELETE FROM classes WHERE id = ?", u.class_id);
      });
    } catch (e) {
      console.error("demo purge failed", u.id, e);
    }
  }
  // sirotci: vymyšlení spolužáci, jejichž návštěvník už neexistuje
  run("DELETE FROM users WHERE demo = 2 AND class_id NOT IN (SELECT class_id FROM users WHERE demo = 1)");
  return expired.length;
}

/** Ukončí demo hned (na přání návštěvníka): smaže jeho třídu a vše kolem. */
export function endVisitorDemo(user: Pick<User, "id" | "class_id" | "demo" | "demo_expires_at">) {
  if (user.demo !== 1 || !user.demo_expires_at) return;
  run("UPDATE users SET demo_expires_at = 0 WHERE class_id = ? AND demo IN (1, 2)", user.class_id);
  purgeExpiredDemos();
}
