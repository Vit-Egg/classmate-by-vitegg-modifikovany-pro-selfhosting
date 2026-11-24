/**
 * Ukázkový účet (demo): účet s vymyšlenými daty bez Bakalářů. Slouží k tomu, aby si aplikaci mohl vyzkoušet někdo bez školního účtu,
 * hlavně recenzent obchodu Google Play (aplikace je za přihlášením a registrace vyžaduje Bakaláře).
 * Zapíná se jen nastavením DEMO_EMAIL a DEMO_PASSWORD; účet se při startu serveru sám vytvoří (a nikdy nepřepíše skutečný účet).
 * Data (rozvrh, známky, absence) se generují za běhu pro libovolný týden a nikam se neukládají; všechno je vymyšlené.
 */
import { addDays, mondayOf, pragueNow } from "./dates";
import { encrypt, hashPassword } from "./crypto";
import { all, get, run, tx } from "./db";
import { mapSubjects } from "./sync";
import type { AbsenceData, Lesson, MarksData, Timetable } from "./types";
import type { KomensMessage } from "./komens";
import type { User } from "./session";
import { USER_SELECT } from "./session";

/**
 * Začátky hodin v minutách od začátku dne a délka hodiny. Den začíná vždy tak, aby právě nějaká hodina probíhala (posouvá se po celých hodinách),
 * takže si recenzent nebo kdokoli s ukázkovým účtem může v kteroukoli denní dobu vyzkoušet odpočet, trvalou notifikaci i widgety.
 */
const OFFSETS = [0, 55, 120, 175, 230, 285];
const LESSON = 45;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function hours() {
  const start = Math.min(Math.max(Math.floor(pragueNow().minutes / 60) * 60 - 120, 0), 24 * 60 - 330);
  return OFFSETS.map((o, i) => ({ hour: i + 1, begin: clock(start + o), end: clock(start + o + LESSON) }));
}

const SUBJECTS = [
  { id: "m", name: "Matematika", abbrev: "M", teacher: "Mgr. M" },
  { id: "cj", name: "Český jazyk", abbrev: "ČJ", teacher: "Mgr. Č" },
  { id: "aj", name: "Anglický jazyk", abbrev: "AJ", teacher: "Mgr. A" },
  { id: "f", name: "Fyzika", abbrev: "F", teacher: "Ing. F" },
  { id: "d", name: "Dějepis", abbrev: "D", teacher: "Mgr. D" },
  { id: "inf", name: "Informatika", abbrev: "INF", teacher: "Ing. I" },
  { id: "tv", name: "Tělesná výchova", abbrev: "TV", teacher: "Mgr. T" },
];
const byId = new Map(SUBJECTS.map((s) => [s.id, s]));

/** Týdenní vzor: pro každý den 1 až 5 předmět v jednotlivých hodinách (a učebna). */
const WEEK: [string, string][][] = [
  [["m", "A101"], ["cj", "A102"], ["aj", "B204"], ["f", "LAB"], ["d", "A103"], ["tv", "TV"]],
  [["aj", "B204"], ["m", "A101"], ["inf", "PC1"], ["inf", "PC1"], ["cj", "A102"]],
  [["cj", "A102"], ["f", "LAB"], ["m", "A101"], ["d", "A103"], ["aj", "B204"], ["tv", "TV"]],
  [["f", "LAB"], ["m", "A101"], ["cj", "A102"], ["aj", "B204"], ["d", "A103"]],
  [["m", "A101"], ["aj", "B204"], ["cj", "A102"], ["f", "LAB"], ["inf", "PC1"], ["inf", "SamS"]],
];

export function timetable(monday: string | null): Timetable {
  const lessons: Lesson[] = [];
  WEEK.forEach((day, di) => {
    day.forEach(([sid, room], hi) => {
      const s = byId.get(sid)!;
      const base: Lesson = { day: di + 1, hour: hi + 1, subject: s.name, subjectId: s.id, room, teacher: s.teacher, groups: [], cycles: [] };
      // dvě změny, ať je vidět suplování i zrušená hodina (jen v konkrétních týdnech, ne ve stálém rozvrhu)
      if (monday && di === 2 && hi === 3) lessons.push({ ...base, subject: "Zeměpis", subjectId: "z", teacher: "Mgr. Z", change: { kind: "substitution", label: "Suplování" } });
      else if (monday && di === 3 && hi === 4) lessons.push({ ...base, subject: s.name, subjectId: "", room: "", teacher: "", change: { kind: "cancelled", label: "Zrušeno" } });
      else lessons.push(base);
    });
  });
  return {
    hours: hours(),
    days: [1, 2, 3, 4, 5].map((day) => ({ day, ...(monday ? { date: addDays(monday, day - 1) } : {}) })),
    lessons,
    subjects: [...SUBJECTS.map(({ id, name, abbrev }) => ({ id, name, abbrev })), { id: "z", name: "Zeměpis", abbrev: "Z" }],
    groups: [],
  };
}

function marks(): MarksData {
  const today = pragueNow().date;
  const rows: Record<string, [string, number, number, number, boolean][]> = {
    m: [["Písemka: rovnice", 1, 3, -2, true], ["Domácí úkol", 2, 1, -9, false]],
    cj: [["Diktát", 3, 2, -5, false], ["Slohová práce", 1, 3, -16, false]],
    aj: [["Test: slovní zásoba", 2, 2, -12, false]],
    f: [["Ústní zkoušení", 1, 1, -4, false]],
  };
  return {
    subjects: SUBJECTS.filter((s) => rows[s.id]).map((s) => {
      const ms = rows[s.id].map(([caption, value, weight, ago, isNew], i) => ({ id: `${s.id}${i}`, subjectId: s.id, subject: s.name, caption, theme: "", text: String(value), value, weight, date: addDays(today, ago), isNew }));
      const w = ms.reduce((a, m) => a + m.weight, 0);
      const avg = ms.reduce((a, m) => a + (m.value as number) * m.weight, 0) / w;
      return { id: s.id, name: s.name, averageText: avg.toFixed(2).replace(".", ","), temporary: s.id === "m" ? "1" : s.id === "cj" ? "2" : "", temporaryNote: s.id === "m" || s.id === "cj" ? "čtvrtletí" : "", marks: ms };
    }),
  };
}

function absence(): AbsenceData {
  return { threshold: 0.25, days: [], subjects: SUBJECTS.map((s) => ({ name: s.name, lessons: 30, missed: 0, late: 0, soon: 0, school: 30 })) };
}

const daysAgo = (n: number, h = 9, m = 15) => `${addDays(pragueNow().date, -n)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+01:00`;
const km = (id: string, title: string, sender: string, text: string, ago: number): KomensMessage => ({ id, title, text, sentAt: daysAgo(ago), sender, read: true, attachments: [], kind: "", canConfirm: false, confirmed: false });

/** Vymyšlené zprávy v Komensu a na nástěnce (složky received, noticeboard, sent). */
export function demoKomens(box: string): KomensMessage[] {
  if (box === "received")
    return [
      km("d1", "Třídní schůzky ve čtvrtek", "Mgr. M (třídní učitel)", "Dobrý den, připomínám, že se tento čtvrtek konají třídní schůzky od 16:00 do 18:00. Rodiče si mohou předem domluvit čas.\n\nMgr. M", 1),
      km("d2", "Výlet do Prahy", "Mgr. Č", "Všichni, kdo se přihlásili na výlet do Prahy, odevzdají do pátku podepsaný souhlas. Sraz bude v 7:30 před školou.", 3),
      km("d3", "Domácí úkol z angličtiny", "Mgr. A", "Nezapomeňte na slovní zásobu z páté lekce, v pátek bude krátký test.", 6),
    ];
  if (box === "noticeboard")
    return [
      km("n1", "Zítra se vaří jen do 12:30", "Školní jídelna", "Z provozních důvodů se zítra vydávají obědy jen do půl jedné.", 0),
      km("n2", "Dny otevřených dveří", "Vedení školy", "Ve čtvrtek a v pátek se ve škole konají dny otevřených dveří. Pomozte prosím vítat zájemce o studium.", 4),
    ];
  if (box === "sent") return [km("s1", "Omluvenka", "Demo Student", "Dobrý den, omlouvám se za včerejší absenci z důvodu nemoci.", 8)];
  return [];
}

/** Vygeneruje obsah cache pro demo uživatele (klíče jako `tt2:2026-10-26`, `tt2:permanent`, `marks`, `absence`); jiné klíče vrací undefined. */
export function demoData(key: string): unknown {
  if (key === "marks") return marks();
  if (key === "absence") return absence();
  if (key === "homework2") return { items: [] };
  const k = /^komens:(received|noticeboard|sent)$/.exec(key);
  if (k) return demoKomens(k[1]);
  if (key === "final1") return { terms: [{ year: "2025/26", semester: "2", semesterName: "2.", closed: true, average: 1.67, achievement: "prospěl s vyznamenáním", absent: 12, notExcused: 0, date: "2026-06-30", marks: [{ subject: "Matematika", text: "1", date: "2026-06-30" }, { subject: "Český jazyk", text: "2", date: "2026-06-30" }, { subject: "Fyzika", text: "2", date: "2026-06-30" }] }] };
  const m = /^tt\d+:(permanent|\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) return timetable(m[1] === "permanent" ? null : mondayOf(m[1]));
  return undefined;
}

/** Vytvoří (nebo aktualizuje heslo) ukázkového účtu, je-li zapnutý v prostředí. Skutečný účet se stejným e-mailem se nikdy nepřepíše. */
export function ensureDemoAccount() {
  const email = (process.env.DEMO_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!email || !password) return;
  if (password.length < 8) return void console.error("DEMO_PASSWORD musí mít aspoň 8 znaků, ukázkový účet se nevytvořil.");
  try {
    const existing = get<{ id: number; demo: number }>("SELECT id, demo FROM users WHERE email = ?", email);
    if (existing && !existing.demo) return void console.error(`DEMO_EMAIL ${email} patří skutečnému účtu, ukázkový účet se nevytvořil.`);
    let id = existing?.id;
    tx(() => {
      if (id) {
        run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), id);
        return;
      }
      const now = Date.now();
      const school = get<{ id: number }>("SELECT id FROM schools WHERE name = 'Demo škola'") ?? { id: Number(run("INSERT INTO schools (name, bakalari_url, created_at, demo) VALUES ('Demo škola', NULL, ?, 1)", now).lastInsertRowid) };
      const cls = get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = 'Demo třída'", school.id) ?? { id: Number(run("INSERT INTO classes (school_id, name) VALUES (?, 'Demo třída')", school.id).lastInsertRowid) };
      // bakalari_* vyplněné jen proto, aby aplikace účet nepovažovala za nepropojený; Bakaláře se pro demo nikdy nevolají
      id = Number(
        run(
          "INSERT INTO users (email, name, password_hash, role, school_id, class_id, bakalari_username, bakalari_refresh_enc, share_marks_stats, created_at, demo) VALUES (?, 'Demo Student', ?, 'user', ?, ?, 'demo', ?, 0, ?, 1)",
          email, hashPassword(password), school.id, cls.id, encrypt("demo"), now,
        ).lastInsertRowid,
      );
    });
    const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, id!);
    if (user && !all("SELECT 1 FROM user_subjects WHERE user_id = ? LIMIT 1", user.id).length) mapSubjects(user, timetable(null));
    if (user) seedContent(user);
  } catch (e) {
    console.error("ensureDemoAccount", e);
  }
}

/** Vymyšlené úkoly a testy ukázkové třídy; při každém startu se obnoví, ať jsou termíny vždy v blízké budoucnosti. */
export function seedContent(user: User, authors: number[] = [user.id]) {
  const subject = (bk: string) => get<{ id: number }>("SELECT id FROM subjects WHERE class_id = ? AND bk_id = ?", user.class_id, bk)?.id ?? null;
  const today = pragueNow().date;
  const now = Date.now();
  tx(() => {
    run("DELETE FROM tasks WHERE class_id = ?", user.class_id);
    run("DELETE FROM tests WHERE class_id = ?", user.class_id);
    let n = 0;
    const by = () => authors[n++ % authors.length];
    // termíny vždy na školní den (v neděli nebo o víkendu se netestuje ani neodevzdává)
    const schoolDay = (days: number) => {
      let d = addDays(today, days);
      while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDays(d, 1);
      return d;
    };
    const task = (sid: string, title: string, days: number | null) =>
      run("INSERT INTO tasks (class_id, subject_id, title, note, due_date, created_by, created_at) VALUES (?, ?, ?, '', ?, ?, ?)", user.class_id, subject(sid), title, days == null ? null : schoolDay(days), by(), now);
    task("m", "Příklady 4 až 9 ze cvičebnice", 1);
    task("aj", "Slovní zásoba: lekce 5", 3);
    task("f", "Referát o pohybu a síle", 6);
    task("cj", "Přečíst třetí kapitolu", null);
    const test = (sid: string, topic: string, days: number) => run("INSERT INTO tests (class_id, subject_id, date, topic, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", user.class_id, subject(sid)!, schoolDay(days), topic, by(), now);
    test("m", "Rovnice a nerovnice", 4);
    test("d", "Středověk", 9);
    test("f", "Mechanika", 13);
  });
}
