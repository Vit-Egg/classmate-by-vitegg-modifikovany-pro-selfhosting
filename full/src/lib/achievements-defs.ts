/**
 * Pochvaly (úspěchy): texty a podmínky. Čistá data bez databáze; počítání je v achievements.ts.
 * Každá pochvala má stupeň 1 až 5 (z něj jsou body: stupeň × 10), kategorii a měřidlo, které z čísel o uživateli (Stats) řekne,
 * kolik už splnil. Odemčená pochvala zůstane navždy, i kdyby se číslo později zhoršilo (třeba po opravě známky).
 * `bad` = kuriozita (údaj, který není k chlubení, třeba absence; ukazuje se neutrálně, bez hodnocení), `secret` = skrytá, dokud ji člověk nezíská.
 */

export type Stats = {
  // známky
  marks: number; ones: number; fives: number; avg: number | null; run1: number; run5: number; perfectSubjects: number; goodSubjects: number;
  comebacks: number; onesInDay: number; percent100: number;
  // absence (absLoaded = data o absenci jsou k dispozici)
  absLoaded: boolean; absPct: number; absMaxSubjectPct: number; absRun: number; unexcused: number; late: number; soon: number; absHours: number; cleanDays: number;
  // poznámky
  notes: number; sharedNotes: number; words: number; noteImages: number; noteAudio: number; noteFiles: number; boards: number; votesGot: number; fiveStarsGot: number;
  comments: number; pinnedNotes: number; nightNotes: number; earlyNotes: number; bigNote: number;
  // úkoly, testy, učení
  tasksDone: number; tasksCreated: number; tasksEarly: number; tasksDayMax: number; taskStreak: number; taskNight: number; taskEarly: number; taskSunday: number; taskLastMinute: number;
  testsCreated: number; studied: number; quizzes: number; quizPerfect: number; cardsKnown: number; summaries: number;
  // aplikace
  activeDays: number; activeStreak: number; ageDays: number; totp: number; avatar: number; contacts: number; bakalari: number; mailOn: number; push: number; calFeed: number;
  todoist: number; strava: number; shareStats: number; appDevice: number; msgRead: number;
  // třída
  cashPaid: number; cashFast: number; duty: number; trainings: number; trainMinutes: number; events: number;
  // za odemčené pochvaly (doplní se až při vyhodnocení)
  unlocked: number;
};

export type Meter = { cur: number; goal: number; /** podíl splnění 0 až 1, když se liší od cur/goal */ frac?: number; /** text u ukazatele, třeba „Teď 1,34“ */ text?: string };
export type Category = "marks" | "attendance" | "homework" | "notes" | "class" | "app" | "secret";
export type Achievement = {
  id: string;
  cat: Category;
  name: string;
  desc: string;
  tier: 1 | 2 | 3 | 4 | 5;
  meter: (s: Stats) => Meter;
  bad?: boolean;
  /** hláška, která se ukáže po získání */
  flavor?: string;
  secret?: boolean;
  /** metapochvala za počet ostatních pochval (počítá se až po ostatních) */
  meta?: boolean;
};

export const CATEGORIES: { id: Category; label: string; hint: string; icon: string }[] = [
  { id: "marks", icon: "star", label: "Prospěch", hint: "známky, série jedniček a průměry" },
  { id: "attendance", icon: "calendar", label: "Docházka", hint: "absence, pozdní příchody a dny bez absence" },
  { id: "homework", icon: "check", label: "Domácí příprava", hint: "úkoly, testy a učení" },
  { id: "notes", icon: "pen", label: "Sešity", hint: "poznámky, tabule a sdílení" },
  { id: "class", icon: "users", label: "Třída a svět kolem", hint: "pokladna, služby, sport a propojení" },
  { id: "app", icon: "sun", label: "Aplikace", hint: "pravidelnost a zabezpečení" },
  { id: "secret", icon: "lock", label: "Tajné", hint: "ukážou se, až je získáš" },
];

export const TIER_NAME = ["", "Lehká", "Snadná", "Střední", "Těžká", "Nejtěžší"];
export const points = (a: Achievement) => a.tier * 10;

/** Stupně podle bodů (záměrně nic, co zní jako opravdový školní výsledek). */
export const LEVELS: { from: number; name: string; line: string }[] = [
  { from: 0, name: "Začátečník", line: "Všechno teprve začíná." },
  { from: 40, name: "Zapisovatel", line: "První zápisy jsou venku." },
  { from: 120, name: "Pilný", line: "Už ti to jde, jen tak dál." },
  { from: 250, name: "Zkušený", line: "Ve třídě už tě znají." },
  { from: 450, name: "Matador", line: "Tohle už je řemeslo." },
  { from: 700, name: "Znalec", line: "Když si nevědí rady, ptají se tebe." },
  { from: 1000, name: "Mistr", line: "Skoro nic tě nepřekvapí." },
  { from: 1400, name: "Velmistr", line: "Škola se ti ohýbá, ne naopak." },
  { from: 1900, name: "Legenda", line: "O tobě se bude ve škole vyprávět." },
];

const num = (cur: number, goal: number): Meter => ({ cur, goal });
const flag = (v: number): Meter => ({ cur: v ? 1 : 0, goal: 1 });
const cs = (n: number) => n.toFixed(2).replace(".", ",");
/** Pochvala za průměr: platí jen s dost známkami; ukazatel se plní podle toho, jak blízko je průměr cíli. */
const avgMeter = (s: Stats, minMarks: number, target: number): Meter => {
  if (s.avg == null || s.marks < minMarks) return { cur: 0, goal: 1, frac: Math.min(1, s.marks / minMarks) * 0.5, text: s.marks < minMarks ? `Potřebuješ aspoň ${minMarks} známek (máš ${s.marks})` : undefined };
  const ok = s.avg <= target + 1e-9;
  return { cur: ok ? 1 : 0, goal: 1, frac: ok ? 1 : Math.max(0, Math.min(0.95, 0.5 + 0.5 * (4 - s.avg) / (4 - target))), text: `Teď ${cs(s.avg)}, cíl ${cs(target)} a míň` };
};

const A = (id: string, cat: Category, name: string, desc: string, tier: Achievement["tier"], meter: Achievement["meter"], opts: Partial<Achievement> = {}): Achievement => ({ id, cat, name, desc, tier, meter, ...opts });
/** Řada pochval za rostoucí počet (stejné ID s číslem, rostoucí stupeň). */
const ladder = (base: string, cat: Category, steps: { goal: number; name: string; desc: string; tier: Achievement["tier"] }[], value: (s: Stats) => number, opts: Partial<Achievement> = {}) =>
  steps.map((st) => A(`${base}_${st.goal}`, cat, st.name, st.desc, st.tier, (s) => num(value(s), st.goal), opts));

const _ACH: Achievement[] = [
  // ───────────────────────── Prospěch
  A("first_one", "marks", "První jednička", "Získej svou první jedničku.", 1, (s) => num(s.ones, 1)),
  ...ladder("ones", "marks", [
    { goal: 10, name: "Jedničkář", desc: "Nasbírej 10 jedniček.", tier: 2 },
    { goal: 25, name: "Sběratel jedniček", desc: "Nasbírej 25 jedniček.", tier: 3 },
    { goal: 50, name: "Jedničkový magnát", desc: "Nasbírej 50 jedniček.", tier: 4 },
    { goal: 100, name: "Jedničkový tsunami", desc: "Nasbírej 100 jedniček.", tier: 5 },
  ], (s) => s.ones),
  ...ladder("run1", "marks", [
    { goal: 3, name: "Hattrick", desc: "Dostaň 3 jedničky po sobě.", tier: 2 },
    { goal: 5, name: "Jedničková série", desc: "Dostaň 5 jedniček po sobě.", tier: 3 },
    { goal: 10, name: "Neporazitelný", desc: "Dostaň 10 jedniček po sobě.", tier: 4 },
    { goal: 20, name: "Nedotknutelný", desc: "Dostaň 20 jedniček po sobě.", tier: 5 },
  ], (s) => s.run1),
  A("one_day2", "marks", "Dvojitá radost", "Dostaň dvě jedničky v jednom dni.", 2, (s) => num(s.onesInDay, 2)),
  A("one_day3", "marks", "Jedničkový den", "Dostaň tři jedničky v jednom dni.", 3, (s) => num(s.onesInDay, 3)),
  A("avg_20", "marks", "Průměr do dvojky", "Měj celkový průměr 2,00 nebo lepší (aspoň 10 známek).", 2, (s) => avgMeter(s, 10, 2)),
  A("avg_15", "marks", "Dobrý průměr", "Měj celkový průměr 1,50 nebo lepší (aspoň 15 známek).", 3, (s) => avgMeter(s, 15, 1.5)),
  A("avg_12", "marks", "Výborný průměr", "Měj celkový průměr 1,20 nebo lepší (aspoň 20 známek).", 4, (s) => avgMeter(s, 20, 1.2)),
  A("avg_105", "marks", "Skoro samé jedničky", "Měj celkový průměr 1,05 nebo lepší (aspoň 20 známek).", 5, (s) => avgMeter(s, 20, 1.05)),
  A("perfect_subject", "marks", "Dokonalý předmět", "Měj z jednoho předmětu aspoň 3 známky a všechny jedničky.", 3, (s) => num(s.perfectSubjects, 1)),
  A("perfect_subject3", "marks", "Trojitá koruna", "Měj tři předměty, ze kterých máš samé jedničky (vždy aspoň 3 známky).", 4, (s) => num(s.perfectSubjects, 3)),
  A("good_subjects", "marks", "Všestranný", "Měj průměr 1,50 nebo lepší hned v pěti předmětech.", 3, (s) => num(s.goodSubjects, 5)),
  A("comeback", "marks", "Rehabilitace", "Po čtyřce nebo pětce z předmětu hned dostaň jedničku.", 2, (s) => num(s.comebacks, 1)),
  A("comeback3", "marks", "Mistr návratů", "Třikrát napravíš čtyřku nebo pětku: po ní dostaň ze stejného předmětu jedničku.", 3, (s) => num(s.comebacks, 3)),
  A("percent100", "marks", "Stoprocentní", "Získej 100 % u písemky nebo testu s procenty.", 3, (s) => num(s.percent100, 1)),
  A("percent100x5", "marks", "Stovka za stovkou", "Získej 100 % u pěti písemek.", 4, (s) => num(s.percent100, 5)),
  ...ladder("marks", "marks", [
    { goal: 25, name: "Sbírka se rozrůstá", desc: "Měj v žákovské 25 známek.", tier: 1 },
    { goal: 75, name: "Žákovská k prasknutí", desc: "Měj v žákovské 75 známek.", tier: 2 },
    { goal: 150, name: "Archiv známek", desc: "Měj v žákovské 150 známek.", tier: 3 },
  ], (s) => s.marks),
  A("first_five", "marks", "První pětka", "Získej svou první pětku.", 1, (s) => num(s.fives, 1), { bad: true }),
  A("fives5", "marks", "Pětková pětka", "Nasbírej 5 pětek.", 2, (s) => num(s.fives, 5), { bad: true }),
  A("run5_3", "marks", "Černá série", "Dostaň 3 pětky po sobě.", 3, (s) => num(s.run5, 3), { bad: true }),

  // ───────────────────────── Docházka
  A("abs_25", "attendance", "Čtvrtina pryč", "Zameškej aspoň 25 % všech hodin.", 3, (s) => ({ ...num(s.absPct, 25), text: s.absLoaded ? `Teď ${s.absPct.toFixed(1).replace(".", ",")} %` : undefined }), { bad: true }),
  A("abs_subject", "attendance", "Přetažená hranice", "Zameškej v jednom předmětu aspoň 25 % hodin.", 3, (s) => ({ ...num(s.absMaxSubjectPct, 25), text: s.absLoaded ? `Nejhorší předmět ${s.absMaxSubjectPct.toFixed(1).replace(".", ",")} %` : undefined }), { bad: true }),
  A("abs_run3", "attendance", "Prodloužený víkend", "Buď nepřítomný 3 dny po sobě.", 1, (s) => num(s.absRun, 3), { bad: true }),
  A("abs_run7", "attendance", "Týdenní výlet", "Buď nepřítomný 7 dní po sobě.", 2, (s) => num(s.absRun, 7), { bad: true }),
  A("abs_run14", "attendance", "Dlouhá dovolená", "Měj 14 dní po sobě absenci.", 4, (s) => num(s.absRun, 14), { bad: true }),
  A("abs_run30", "attendance", "Expedice", "Měj 30 dní po sobě absenci.", 5, (s) => num(s.absRun, 30), { bad: true }),
  A("unexcused1", "attendance", "Neomluvená hodina", "Měj aspoň jednu neomluvenou hodinu.", 1, (s) => num(s.unexcused, 1), { bad: true }),
  A("unexcused10", "attendance", "Záhadný zmizelec", "Měj 10 neomluvených hodin.", 3, (s) => num(s.unexcused, 10), { bad: true }),
  ...ladder("late", "attendance", [
    { goal: 5, name: "Ranní spurt", desc: "Přijď pětkrát pozdě.", tier: 1 },
    { goal: 15, name: "Maraton do třídy", desc: "Přijď patnáctkrát pozdě.", tier: 2 },
    { goal: 30, name: "Zvonění? Jaké zvonění?", desc: "Přijď třicetkrát pozdě.", tier: 3 },
  ], (s) => s.late, { bad: true }),
  A("soon5", "attendance", "Rychlý únik", "Odejdi pětkrát předčasně.", 2, (s) => num(s.soon, 5), { bad: true }),
  A("abs_hours100", "attendance", "Sto hodin volna", "Měj dohromady 100 zameškaných hodin.", 3, (s) => num(s.absHours, 100), { bad: true }),
  A("clean14", "attendance", "Dvoutýdenní štít", "Nezameškej 14 dní po sobě žádnou hodinu.", 2, (s) => ({ ...num(s.absLoaded ? s.cleanDays : 0, 14), text: s.absLoaded ? `Teď ${s.cleanDays} dní` : undefined })),
  A("clean30", "attendance", "Nezlomný", "Nezameškej 30 dní po sobě žádnou hodinu.", 3, (s) => num(s.absLoaded ? s.cleanDays : 0, 30)),
  A("clean60", "attendance", "Skála", "Nezameškej 60 dní po sobě žádnou hodinu.", 4, (s) => num(s.absLoaded ? s.cleanDays : 0, 60)),
  A("clean100", "attendance", "Sto dní na stráži", "Nezameškej 100 dní po sobě žádnou hodinu.", 5, (s) => num(s.absLoaded ? s.cleanDays : 0, 100)),

  // ───────────────────────── Domácí příprava
  A("task1", "homework", "První splněný úkol", "Odškrtni svůj první úkol.", 1, (s) => num(s.tasksDone, 1)),
  ...ladder("tasks", "homework", [
    { goal: 10, name: "Pilný žák", desc: "Splň 10 úkolů.", tier: 1 },
    { goal: 25, name: "Úkolový dříč", desc: "Splň 25 úkolů.", tier: 2 },
    { goal: 50, name: "Domácí úkoly bez milosti", desc: "Splň 50 úkolů.", tier: 3 },
    { goal: 100, name: "Stovka dole", desc: "Splň 100 úkolů.", tier: 4 },
    { goal: 250, name: "Úkolový terminátor", desc: "Splň 250 úkolů.", tier: 5 },
    { goal: 500, name: "Pán úkolů", desc: "Splň 500 úkolů.", tier: 5 },
  ], (s) => s.tasksDone),
  A("task_day5", "homework", "Úklid seznamu", "Splň 5 úkolů během jednoho dne.", 2, (s) => num(s.tasksDayMax, 5)),
  A("task_day10", "homework", "Úkolový maraton", "Splň 10 úkolů během jednoho dne.", 3, (s) => num(s.tasksDayMax, 10)),
  ...ladder("taskstreak", "homework", [
    { goal: 3, name: "Rozjezd", desc: "Splň úkol 3 dny po sobě.", tier: 1 },
    { goal: 7, name: "Týden bez resty", desc: "Splň úkol 7 dní po sobě.", tier: 2 },
    { goal: 14, name: "Dva týdny bez resty", desc: "Splň úkol 14 dní po sobě.", tier: 3 },
    { goal: 30, name: "Měsíc dochvilnosti", desc: "Splň úkol 30 dní po sobě.", tier: 4 },
  ], (s) => s.taskStreak),
  A("task_early5", "homework", "S předstihem", "Splň 5 úkolů dřív, než je jejich termín.", 2, (s) => num(s.tasksEarly, 5)),
  A("task_early25", "homework", "Čas je peníze", "Splň 25 úkolů dřív, než je jejich termín.", 3, (s) => num(s.tasksEarly, 25)),
  A("task_created1", "homework", "Hlas třídy", "Zadej úkol, který uvidí spolužáci.", 1, (s) => num(s.tasksCreated, 1)),
  A("task_created10", "homework", "Třídní zapisovatel", "Zadej 10 úkolů.", 2, (s) => num(s.tasksCreated, 10)),
  A("task_created50", "homework", "Hlídač zadání", "Zadej 50 úkolů.", 3, (s) => num(s.tasksCreated, 50)),
  A("test_created1", "homework", "Informátor", "Zadej spolužákům první test nebo zkoušení.", 1, (s) => num(s.testsCreated, 1)),
  A("test_created10", "homework", "Hlásná trouba", "Zadej 10 testů nebo zkoušení.", 2, (s) => num(s.testsCreated, 10)),
  A("study1", "homework", "První učení", "Uč se na test pomocí Studia (kartičky nebo kvíz).", 1, (s) => num(s.studied, 1)),
  A("study5", "homework", "Plán je plán", "Uč se ve Studiu na 5 různých testů.", 3, (s) => num(s.studied, 5)),
  A("quiz_perfect", "homework", "Bez jediné chyby", "Odpověz v kvízu ve Studiu správně na všechno.", 3, (s) => num(s.quizPerfect, 1)),
  A("quiz_perfect5", "homework", "Kvízový čaroděj", "Projdi bez chyby 5 kvízů.", 4, (s) => num(s.quizPerfect, 5)),
  A("cards50", "homework", "Kartičkový král", "Označ 50 kartiček jako „umím“.", 2, (s) => num(s.cardsKnown, 50)),
  A("cards250", "homework", "Paměť jako slon", "Označ 250 kartiček jako „umím“.", 4, (s) => num(s.cardsKnown, 250)),
  A("summary1", "homework", "Rychlé čtení", "Nech si u předmětu vytvořit shrnutí od AI.", 1, (s) => num(s.summaries, 1)),

  // ───────────────────────── Sešity
  A("note1", "notes", "První zápis", "Napiš svou první poznámku.", 1, (s) => num(s.notes, 1)),
  ...ladder("notes", "notes", [
    { goal: 10, name: "Zapisovatel", desc: "Napiš 10 poznámek.", tier: 1 },
    { goal: 25, name: "Pilný zapisovatel", desc: "Napiš 25 poznámek.", tier: 2 },
    { goal: 50, name: "Sešit plný", desc: "Napiš 50 poznámek.", tier: 3 },
    { goal: 100, name: "Stovkař", desc: "Napiš 100 poznámek.", tier: 4 },
    { goal: 250, name: "Živá encyklopedie", desc: "Napiš 250 poznámek.", tier: 5 },
  ], (s) => s.notes),
  ...ladder("words", "notes", [
    { goal: 1_000, name: "Slohová práce", desc: "Napiš dohromady 1 000 slov v poznámkách.", tier: 1 },
    { goal: 10_000, name: "Diplomová práce", desc: "Napiš dohromady 10 000 slov v poznámkách.", tier: 3 },
    { goal: 50_000, name: "Spisovatel", desc: "Napiš dohromady 50 000 slov v poznámkách.", tier: 5 },
  ], (s) => s.words),
  A("shared1", "notes", "Sdílím s třídou", "Nasdílej spolužákům poznámku.", 1, (s) => num(s.sharedNotes, 1)),
  A("shared10", "notes", "Třídní knihovna", "Nasdílej spolužákům 10 poznámek.", 3, (s) => num(s.sharedNotes, 10)),
  A("vote1", "notes", "První hvězdička", "Ať spolužák ohodnotí tvou sdílenou poznámku hvězdičkami.", 1, (s) => num(s.votesGot, 1)),
  A("vote10", "notes", "Oblíbený zapisovatel", "Získej 10 hodnocení svých poznámek.", 2, (s) => num(s.votesGot, 10)),
  A("star5", "notes", "Pětihvězdičkový", "Získej 5× nejlepší hodnocení u svých poznámek.", 3, (s) => num(s.fiveStarsGot, 5)),
  A("image1", "notes", "Obrázek vydá za tisíc slov", "Vlož do poznámky obrázek.", 1, (s) => num(s.noteImages, 1)),
  A("image25", "notes", "Ilustrátor", "Vlož do poznámek 25 obrázků.", 3, (s) => num(s.noteImages, 25)),
  A("audio1", "notes", "Diktafon", "Nahraj k poznámce zvuk.", 2, (s) => num(s.noteAudio, 1)),
  A("audio10", "notes", "Zvukový archiv", "Nahraj k poznámkám 10 zvukových záznamů.", 3, (s) => num(s.noteAudio, 10)),
  A("file1", "notes", "Do zavazadla", "Přilož k poznámce soubor.", 1, (s) => num(s.noteFiles, 1)),
  A("board1", "notes", "K tabuli!", "Nakresli něco na tabuli v poznámce.", 2, (s) => num(s.boards, 1)),
  A("comment1", "notes", "Komentátor", "Okomentuj poznámku spolužáka.", 1, (s) => num(s.comments, 1)),
  A("comment10", "notes", "Kritik", "Napiš 10 komentářů k poznámkám.", 2, (s) => num(s.comments, 10)),
  A("pin1", "notes", "Připíchnuto", "Připni si poznámku nahoru.", 1, (s) => num(s.pinnedNotes, 1)),

  // ───────────────────────── Třída a svět kolem
  A("cash1", "class", "Platí se", "Zaplať přes Classmate první třídní příspěvek.", 1, (s) => num(s.cashPaid, 1)),
  A("cash5", "class", "Spolehlivý plátce", "Zaplať 5 třídních příspěvků.", 2, (s) => num(s.cashPaid, 5)),
  A("cash15", "class", "Hrdina pokladny", "Zaplať 15 třídních příspěvků.", 3, (s) => num(s.cashPaid, 15)),
  A("cash_fast", "class", "Bleskový plátce", "Zaplať 3 příspěvky do 24 hodin od vyhlášení.", 3, (s) => num(s.cashFast, 3)),
  A("duty1", "class", "Služba třídy", "Odslouži svůj první týden služby.", 1, (s) => num(s.duty, 1)),
  A("duty3", "class", "Zkušený směnař", "Odslouži 3 týdny služby.", 2, (s) => num(s.duty, 3)),
  A("duty10", "class", "Pan Čistota", "Odslouži 10 týdnů služby.", 3, (s) => num(s.duty, 10)),
  A("avatar", "class", "Ukaž se světu", "Nahraj si profilovou fotku.", 1, (s) => flag(s.avatar)),
  A("contacts1", "class", "Na příjmu", "Přidej si do profilu první kontakt.", 1, (s) => num(s.contacts, 1)),
  A("contacts5", "class", "Společenský motýl", "Přidej si do profilu 5 kontaktů.", 2, (s) => num(s.contacts, 5)),
  A("contacts10", "class", "Celebrita třídy", "Přidej si do profilu 10 kontaktů.", 3, (s) => num(s.contacts, 10)),
  A("event1", "class", "Vlastní termín", "Přidej do kalendáře vlastní událost.", 1, (s) => num(s.events, 1)),
  A("event10", "class", "Pán diáře", "Přidej do kalendáře 10 vlastních událostí.", 2, (s) => num(s.events, 10)),
  A("train1", "class", "Zahřívací kolo", "Zapiš první trénink do Tréninkového deníku.", 1, (s) => num(s.trainings, 1)),
  A("train25", "class", "Sportovec třídy", "Zapiš 25 tréninků.", 2, (s) => num(s.trainings, 25)),
  A("train100", "class", "Železný sportovec", "Zapiš 100 tréninků.", 4, (s) => num(s.trainings, 100)),
  A("train_min1000", "class", "Tisíc minut v pohybu", "Nasbírej 1 000 minut tréninku.", 3, (s) => num(s.trainMinutes, 1_000)),
  A("train_min10000", "class", "Olympionik", "Nasbírej 10 000 minut tréninku.", 5, (s) => num(s.trainMinutes, 10_000)),
  A("calfeed", "class", "Rozvrh v kapse", "Připoj si kalendář Classmate k telefonu nebo počítači.", 2, (s) => flag(s.calFeed)),
  A("todoist", "class", "Úkoly všude", "Propoj Classmate s Todoistem.", 2, (s) => flag(s.todoist)),
  A("strava", "class", "Sportovní propojení", "Propoj Classmate se Stravou.", 2, (s) => flag(s.strava)),

  // ───────────────────────── Školní řád
  ...ladder("age", "app", [
    { goal: 7, name: "První týden", desc: "Používej Classmate týden.", tier: 1 },
    { goal: 30, name: "První měsíc", desc: "Používej Classmate měsíc.", tier: 1 },
    { goal: 180, name: "Pololetí za námi", desc: "Používej Classmate půl roku.", tier: 2 },
    { goal: 365, name: "Školní rok", desc: "Používej Classmate rok.", tier: 3 },
    { goal: 730, name: "Dvouletka", desc: "Používej Classmate dva roky.", tier: 4 },
    { goal: 1095, name: "Třetí ročník", desc: "Používej Classmate tři roky.", tier: 5 },
  ], (s) => s.ageDays),
  ...ladder("active", "app", [
    { goal: 7, name: "Pravidelný návštěvník", desc: "Otevři Classmate v 7 různých dnech.", tier: 1 },
    { goal: 30, name: "Věrný žák", desc: "Otevři Classmate ve 30 různých dnech.", tier: 2 },
    { goal: 100, name: "Stálý host", desc: "Otevři Classmate ve 100 různých dnech.", tier: 3 },
    { goal: 180, name: "Bydlím tady", desc: "Otevři Classmate ve 180 různých dnech.", tier: 4 },
  ], (s) => s.activeDays),
  ...ladder("streak", "app", [
    { goal: 3, name: "Zažehnuto", desc: "Otevři Classmate 3 dny po sobě.", tier: 1 },
    { goal: 7, name: "Rozjeté", desc: "Otevři Classmate 7 dní po sobě.", tier: 2 },
    { goal: 14, name: "Neuhasitelný", desc: "Otevři Classmate 14 dní po sobě.", tier: 3 },
    { goal: 30, name: "Zvyk je železná košile", desc: "Otevři Classmate 30 dní po sobě.", tier: 4 },
    { goal: 60, name: "Perpetuum mobile", desc: "Otevři Classmate 60 dní po sobě.", tier: 5 },
  ], (s) => s.activeStreak),
  A("bakalari", "app", "Propojeno s Bakaláři", "Propoj Classmate se svým účtem v Bakalářích.", 1, (s) => flag(s.bakalari)),
  A("totp", "app", "Dvojitý zámek", "Zapni dvoufázové ověření.", 2, (s) => flag(s.totp)),
  A("mail", "app", "Pošťák", "Zapni e-mailová upozornění.", 1, (s) => flag(s.mailOn)),
  A("push", "app", "Upozornění na dosah", "Zapni upozornění v prohlížeči nebo v mobilní aplikaci.", 1, (s) => flag(s.push)),
  A("app", "app", "Classmate v kapse", "Přihlas se v mobilní aplikaci.", 2, (s) => flag(s.appDevice)),
  A("stats", "app", "Přispěvatel statistik", "Povol anonymní sdílení známek do průměrů třídy.", 2, (s) => flag(s.shareStats)),
  A("read25", "app", "Pozorný čtenář", "Přečti 25 zpráv ve zvonečku.", 1, (s) => num(s.msgRead, 25)),

  // ───────────────────────── Tajné
  A("night", "secret", "Noční sova", "Zapiš poznámku nebo splň úkol po půlnoci.", 2, (s) => num(s.nightNotes + s.taskNight, 1), { secret: true }),
  A("early", "secret", "Ranní ptáče", "Zapiš poznámku nebo splň úkol mezi pátou a sedmou ráno.", 2, (s) => num(s.earlyNotes + s.taskEarly, 1), { secret: true }),
  A("sunday", "secret", "Nedělní večer", "Splň úkol v neděli po 18. hodině.", 2, (s) => num(s.taskSunday, 1), { secret: true }),
  A("lastminute", "secret", "Na poslední chvíli", "Splň úkol v den jeho termínu po 22. hodině.", 2, (s) => num(s.taskLastMinute, 1), { secret: true }),
  A("answer42", "secret", "Odpověď na všechno", "Napiš 42 poznámek.", 2, (s) => num(s.notes, 42), { secret: true }),
  A("big_one", "secret", "Elaborát", "Napiš jednu poznámku delší než 3 000 slov.", 3, (s) => num(s.bigNote, 1), { secret: true }),

  // ───────────────────────── Souhrnné
  A("meta10", "app", "Začíná sbírka", "Získej 10 trofejí.", 2, (s) => num(s.unlocked, 10), { meta: true }),
  A("meta25", "app", "Police se plní", "Získej 25 trofejí.", 3, (s) => num(s.unlocked, 25), { meta: true }),
  A("meta50", "app", "Vitrína", "Získej 50 trofejí.", 4, (s) => num(s.unlocked, 50), { meta: true }),
  A("meta80", "app", "Muzeum trofejí", "Získej 80 trofejí.", 5, (s) => num(s.unlocked, 80), { meta: true }),
];

/** Hlášky po získání (drobný detail navíc, jen pro radost). */
const FLAVOR: Record<string, string> = {
  first_one: "Začátek velké kariéry.",
  ones_10: "Do dvojciferného čísla to dotáhne každý, kdo to myslí vážně.",
  ones_25: "Tolik jedniček by dalo na vlastní nástěnku.",
  ones_50: "Učitelé už tě zdraví jménem.",
  ones_100: "Statistici se u tebe zastavují a kroutí hlavou.",
  run1_3: "Tři v řadě. Hattrick jako od Pelého.",
  run1_5: "Rozjetý vlak se těžko zastavuje.",
  run1_10: "Deset v řadě. Tohle už není náhoda.",
  run1_20: "Dvacet v řadě. Kdo ví, jestli to někdo předběhne.",
  one_day3: "Den, který se hned tak nezapomíná.",
  perfect_subject: "Tenhle předmět tě má rád.",
  comeback: "Pád, vstát, jednička.",
  first_five: "Teď už jsi opravdový žák.",
  abs_run14: "Doufáme, že aspoň u moře.",
  abs_run30: "Pohlednici nepošleš?",
  unexcused1: "Omluvenku si vyřiď včas.",
  task1: "První odškrtnutí je nejsladší.",
  tasks_50: "Úkoly se bojí, když jdeš kolem.",
  tasks_100: "Stovka. Zbytek je rutina.",
  tasks_500: "Tohle už je životní styl.",
  task_day10: "Deset za den. Seznam úkolů vyhlásil kapitulaci.",
  taskstreak_30: "Měsíc bez jediného dne bez splněného úkolu.",
  quiz_perfect: "Hlavička pracuje na plné obrátky.",
  cards250: "Paměť jako slon, rychlost jako gepard.",
  note1: "Z prázdného papíru se stal sešit.",
  notes_100: "Sto poznámek. To je malá knihovna.",
  words_10000: "Tolik slov by stačilo na krátkou povídku.",
  words_50000: "Padesát tisíc slov je skoro celý román.",
  shared1: "Sdílená radost je dvojnásobná radost.",
  audio1: "Mikrofon je tvůj kamarád.",
  board1: "Kredou do toho!",
  cash1: "Pokladník je spokojený.",
  cash_fast: "Rychlejší než vlastní stín.",
  duty1: "Tabule je čistá, třída šťastná.",
  avatar: "Teď už tě poznají i na fotce.",
  contacts10: "Napříč celým internetem.",
  train_min1000: "Tisíc minut je skoro 17 hodin potu.",
  calfeed: "Rozvrh teď máš všude, kde ho potřebuješ.",
  totp: "Dvojitý zámek, klidný spánek.",
  streak_7: "Týden v kuse. Zvyk se rodí.",
  streak_30: "Měsíc bez vynechání. To je disciplína.",
  streak_60: "Dva měsíce. Další jsou už jen čísla.",
  age_365: "Rok společně. Díky, že jsi tu.",
  night: "Kdo spí, ten nehřeší. Ty ale pracuješ.",
  early: "Ranní ptáče dál doskáče.",
  sunday: "Neděle večer, pocit z pondělka.",
  lastminute: "Adrenalin je adrenalin.",
  answer42: "Odpověď na život, vesmír a vůbec.",
  big_one: "Tohle už je skoro diplomka.",
  clean30: "Měsíc bez zameškané hodiny. Respekt.",
  clean100: "Sto dní na stráži. Pevné nervy.",
  meta50: "Padesát trofejí. To chce vitrínu.",
};
export const ACHIEVEMENTS: Achievement[] = _ACH.map((a) => (FLAVOR[a.id] ? { ...a, flavor: FLAVOR[a.id] } : a));

export const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const MAX_POINTS = ACHIEVEMENTS.reduce((n, a) => n + points(a), 0);

/** Ikona z Icon.tsx k pochvale (jednoduchá, jednobarevná, stejná jako jinde v aplikaci). */
export function iconOf(a: Achievement): string {
  const id = a.id;
  if (a.secret) return id === "night" ? "moon" : id === "early" ? "sun" : "star";
  if (a.meta) return "trophy";
  if (a.cat === "marks") return /^(run|one_day)/.test(id) ? "pulse" : "star";
  if (a.cat === "attendance") return id.startsWith("clean") ? "check" : /^(late|soon)/.test(id) ? "calendar" : "absence";
  if (a.cat === "homework") return /^(study|quiz|cards|summary)/.test(id) ? "cap" : id.startsWith("test_") ? "exam" : "check";
  if (a.cat === "notes") return id.startsWith("shared") ? "users" : id.startsWith("file") || id.startsWith("image") ? "file" : "pen";
  if (a.cat === "class") return id.startsWith("cash") ? "coin" : id.startsWith("duty") ? "broom" : id.startsWith("train") ? "pulse" : /^(event|calfeed)/.test(id) ? "caldays" : /^(todoist|strava)/.test(id) ? "link" : "users";
  if (id.startsWith("streak")) return "pulse";
  if (id.startsWith("bakalari")) return "link";
  if (id === "totp") return "shield";
  if (id === "mail" || id === "read25") return "mail";
  if (id === "push" || id === "app") return "bell";
  return id.startsWith("age") || id.startsWith("active") ? "sun" : "star";
}
