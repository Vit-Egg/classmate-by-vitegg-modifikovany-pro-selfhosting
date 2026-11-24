export const TZ = "Europe/Prague";
const DAYS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
const DAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

export const dayName = (dow: number) => DAYS[dow - 1];
export const dayShort = (dow: number) => DAYS_SHORT[dow - 1];

export function pragueNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), hour: Number(parts.hour), dow: dowOf(date) };
}

const toUtc = (iso: string) => new Date(iso + "T00:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** 1 = pondělí … 7 = neděle */
export const dowOf = (iso: string) => ((toUtc(iso).getUTCDay() + 6) % 7) + 1;
export const addDays = (iso: string, n: number) => toIso(new Date(toUtc(iso).getTime() + n * 86_400_000));
export const mondayOf = (iso: string) => addDays(iso, 1 - dowOf(iso));
export const diffDays = (a: string, b: string) => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);

export const fmtShort = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
export const fmtFull = (iso: string) => `${dayName(dowOf(iso))} ${Number(iso.slice(8, 10))}. ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;
export const fmtDateTime = (ms: number) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
export const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" }).format(ms);
export const fmtTimeSeconds = (ms: number) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(ms);

export function relativeDay(iso: string, today: string) {
  const d = diffDays(today, iso);
  if (d === 0) return "dnes";
  if (d === 1) return "zítra";
  if (d === -1) return "včera";
  if (d < 0) return `před ${-d} ${-d < 5 ? "dny" : "dny"}`;
  return `za ${d} ${d < 5 ? "dny" : "dní"}`;
}

const GREET = {
  morning: ["Dobré ráno", "Dobré ráno", "Krásné ráno", "Hezké ráno", "Ranní ptáče, dobré ráno", "Vítej v novém dni", "Zdravím", "Čau"],
  day: ["Dobrý den", "Dobrý den", "Ahoj", "Zdravím", "Čau", "Nazdar", "Hezký den", "Vítej zpět", "Hezké odpoledne"],
  evening: ["Dobrý večer", "Dobrý večer", "Krásný večer", "Hezký večer", "Ahoj", "Vítej zpět", "Zdravím", "Čau"],
  night: ["Ještě vzhůru", "Dobrou noc", "Noční sova", "Dobrý večer"],
};
const WEEKDAY: Record<number, string[]> = { 1: ["Hezké pondělí", "Jdeme na to"], 5: ["Šťastný pátek", "Už jen kousek do víkendu"], 6: ["Hezký víkend", "Pěkná sobota"], 7: ["Hezký víkend", "Pěkná neděle"] };

/**
 * Pozdrav podle denní doby (a občas podle dne v týdnu). Výběr je stálý po dobu hodiny a pro každého jiný (`seed`),
 * aby se text při každém obnovení stránky nepřehazoval.
 */
export function greeting(hour: number, seed = 0, dow?: number, date = "") {
  const pool = hour >= 5 && hour < 10 ? GREET.morning : hour >= 10 && hour < 18 ? GREET.day : hour >= 18 && hour < 23 ? GREET.evening : GREET.night;
  const extra = dow ? WEEKDAY[dow] ?? [] : [];
  const all = hour >= 5 && hour < 23 ? [...pool, ...extra] : pool;
  let h = seed * 2654435761;
  for (const ch of `${date}${hour}`) h = (Math.imul(h ^ ch.charCodeAt(0), 16777619)) >>> 0;
  return all[h % all.length];
}

export function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** „za 1 minutu“, „za 2 minuty“, „za 5 minut“: po předložce „za“ je 4. pád, takže jednotné číslo má koncovku -u. */
export const inMinutes = (n: number) => `za ${n} ${plural(n, "minutu", "minuty", "minut")}`;
/** „za 42 vteřin“, když zbývá méně než minuta, jinak „za 5 minut“; `secs` jsou zbývající vteřiny (zaokrouhlené nahoru). */
export const inTime = (minutes: number, secs: number) => (secs < 60 ? `za ${Math.max(1, secs)} ${plural(Math.max(1, secs), "vteřinu", "vteřiny", "vteřin")}` : inMinutes(minutes));

/** „za 3 dny“, „za 5 dní“ (od dvou dní výš, jednička se řeší zvlášť slovem „zítra“). */
export const inDays = (n: number) => (n === 1 ? "zítra" : `za ${n} ${plural(n, "den", "dny", "dní")}`);

/** Název předmětu uprostřed věty: „Německý jazyk“ → „německý jazyk“, ale zkratky (TV, ICT) a vlastní jména s dalším velkým písmenem zůstanou. */
export function midSentence(name: string) {
  const first = name.split(/[\s,/]/)[0] ?? "";
  if (first.length < 2 || /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(first.slice(1))) return name;
  return name.charAt(0).toLocaleLowerCase("cs-CZ") + name.slice(1);
}

/** Ženská jména končící souhláskou: v 5. pádu se nemění (kdyby se řídila mužskými pravidly, vznikla by chyba). */
const FEMALE_UNCHANGED = new Set(["ester", "miriam", "mirjam", "ruth", "carmen", "ingrid", "margit", "dagmar", "beatrix", "ines", "nikol", "karin", "sabin", "isabel", "abigail", "lilian", "vivian", "vivien", "jasmin", "jennifer", "rachel", "ellen", "helen", "kim", "ronja", "mabel"]);

/**
 * Křestní jméno v 5. pádu (oslovení): Šimon → Šimone, Lukáš → Lukáši, Honza → Honzo, Marek → Marku, Petr → Petře, Pavel → Pavle,
 * Zdeněk → Zdeňku, Ondřej → Ondřeji, Eliška → Eliško, Lucie → Lucie. U neznámých tvarů se jméno nechá beze změny.
 */
export function vocative(first: string) {
  const n = first.trim().split(/\s+/)[0] ?? "";
  if (n.length < 2) return n;
  const low = n.toLowerCase();
  const cut = (k: number) => n.slice(0, n.length - k);
  const lower = (k: number, add: string) => cut(k) + (n.slice(-k) === n.slice(-k).toUpperCase() && n.length > 3 ? add.toUpperCase() : add);
  if (FEMALE_UNCHANGED.has(low)) return n;
  // -a: Honza → Honzo, Eliška → Eliško; -ia: Julia → Julie
  if (/ia$/.test(low)) return lower(1, "e");
  if (/a$/.test(low)) return lower(1, "o");
  // měkký a stálý konec zůstává: Lucie, Jiří, Ivo, Tony, Martine už jsou oslovení
  if (/(e|í|ý|y|o|u|ů|i)$/.test(low)) return n;
  // -ek, -ěk: Marek → Marku, Radek → Radku, Zdeněk → Zdeňku, Luděk → Luďku
  const ek = /([dtn])ěk$/.exec(low);
  if (ek) return lower(3, { d: "ďku", t: "ťku", n: "ňku" }[ek[1] as "d" | "t" | "n"]);
  if (/ěk$/.test(low)) return lower(2, "ku");
  if (/ek$/.test(low)) return lower(2, "ku");
  if (/ec$/.test(low)) return lower(2, "če");
  // -el: Pavel → Pavle, Karel → Karle, ale Daniel → Danieli, Michael → Michaeli, Marcel → Marceli
  if (/[aeiíu]el$/.test(low) || /cel$/.test(low)) return n + "i";
  if (/el$/.test(low)) return lower(2, "le");
  // -tr, -dr, -br…: Petr → Petře, Alexandr → Alexandře; po samohlásce Viktor → Viktore, Lubomír → Lubomíre
  if (/[bcdfghjklmnpqrstvwxzščřžťďň]r$/.test(low)) return lower(1, "ře");
  // tvrdé k, g, h, ch: Dominik → Dominiku, Vojtěch → Vojtěchu, Oldřich → Oldřichu
  if (/(ch|k|g|h)$/.test(low)) return n + "u";
  // měkké š, ž, č, ř, c, j: Lukáš → Lukáši, Tomáš → Tomáši, Matěj → Matěji, Ondřej → Ondřeji, Max → Maxi
  if (/[šžčřcjx]$/.test(low)) return n + "i";
  if (/[ňďť]$/.test(low)) return n + "i";
  // ostatní souhlásky: Šimon → Šimone, Jan → Jane, Filip → Filipe, Josef → Josefe
  if (/[bdfjlmnpqrstvwzs]$/.test(low) || /[áéíóúůýěaeiouy]$/.test(low) === false) return n + "e";
  return n;
}

/** Aktuální čas v Praze jako minuty od půlnoci i s vteřinami (desetinné číslo). */
export function pragueClock(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60;
}

/** „RRRR-MM-DDTHH:MM“ (čas na hodinách v Praze, třeba z pole datetime-local) na okamžik v milisekundách; null, když to není platný údaj. */
export function pragueLocalToMs(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!Number.isFinite(asUtc)) return null;
  const wall = (t: number) => {
    const p = pragueNow(new Date(t));
    return Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10)) + p.minutes * 60_000;
  };
  const first = asUtc - (wall(asUtc) - asUtc);
  return asUtc - (wall(first) - first);
}

export const hhmm = (t: string) => (t.length < 5 ? "0" + t : t);

/** Denní „hláška“ – stejná po celý den, ať text neskáče při každém načtení. */
export function pickDaily<T>(list: T[], salt = 0) {
  return list[(Number(pragueNow().date.replaceAll("-", "")) + salt) % list.length];
}

/** Šablona názvu nové poznámky: {den}, {datum}, {d}, {m}, {rok}, {cas}. */
export const NOTE_TITLE_DEFAULT = "{den} - {datum}";
export function renderNoteTitle(template: string | null | undefined, t = pragueNow()) {
  const [y, m, d] = t.date.split("-").map(Number);
  const cas = `${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")}`;
  const out = (template?.trim() || NOTE_TITLE_DEFAULT)
    .replaceAll("{den}", dayName(t.dow))
    .replaceAll("{datum}", `${d}.${m}.${y}`)
    .replaceAll("{d}", String(d))
    .replaceAll("{m}", String(m))
    .replaceAll("{rok}", String(y))
    .replaceAll("{cas}", cas);
  return out.slice(0, 200);
}

/** Poslední den školního roku (30. 6.), do kterého se dá od zadaného data opakovat. */
export function schoolYearEnd(iso: string) {
  const y = Number(iso.slice(0, 4));
  return `${iso.slice(5, 7) >= "07" ? y + 1 : y}-06-30`;
}

const MONTH_SHORT = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
/** Zkratka měsíce pro štítek s datem („lis“). */
export const monthShort = (iso: string) => MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? "";
