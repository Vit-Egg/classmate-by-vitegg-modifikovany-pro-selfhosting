/**
 * Obraz dne pro mobilní aplikaci (widget a trvalá notifikace), verze 1; popis ve classmate-app/contract/snapshot.md.
 * Texty i pravidla (samostudium, zrušené hodiny, přestávky) vznikají tady ze stejných funkcí jako na webu (`dayState`),
 * aplikace je jen vykreslí a pustí odpočet. Úsek dne ("segment") se vybírá podle času, takže aplikace funguje i offline.
 */
import { addDays, dowOf, mondayOf, midSentence, pragueNow, TZ } from "./dates";
import { listTasks, listTests, subjectHues } from "./content";
import { unreadCount } from "./messages";
import { buildSlots, dayState, fmtMin, type Slot } from "./schedule";
import { SELF_STUDY } from "./selfstudy";
import { fcmEnabled } from "./fcm";
import { stravaAccount, stravaMenu, isLunch } from "./strava";
import { getTimetable, peekMarks, peekTimetable } from "./sync";
import type { Timetable } from "./types";
import type { User } from "./session";

export const SNAPSHOT_DAYS = 7;

export type Segment = { from: number; to: number; kind: string; title: string; subtitle: string; countdownTo: number | null; live: boolean; lead?: string; join?: "za" | "·" };
export type SnapshotLesson = { hour: number; subject: string; hue: string; room: string; teacher: string; begin: number; end: number; beginText: string; endText: string; cancelled: boolean; selfStudy: boolean; change: string | null };

/** Čas v Praze (vteřiny odříznuté) jako rozdíl proti UTC v ms. */
function offsetAt(utc: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(utc)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(utc / 1000) * 1000;
}

/** Okamžik (ms) pražského data a minut od půlnoci; hodnota 1440 = příští půlnoc. Počítá i se změnou času. */
export function pragueMs(date: string, minutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, Math.round(minutes));
  let t = guess - offsetAt(guess);
  const second = offsetAt(t);
  if (second !== guess - t) t = guess - second;
  return t;
}

const room = (s: Slot) => (s.room ? ` · ${s.room}` : "");

/** Úseky jednoho dne: každý má vlastní nadpis, podnadpis, konec odpočtu a příznak, zda má být vidět trvalá notifikace. */
export function daySegments(date: string, slots: Slot[], allDay: string | undefined): Segment[] {
  const at = (m: number) => pragueMs(date, m);
  // `lead` + `join` skládá aplikace do nadpisu s minutami jako panel na webu („Přestávka · 5 minut“, „Zvonění za 12 minut“)
  const seg = (a: number, b: number, kind: string, title: string, subtitle = "", countdownMin: number | null = null, live = false, lead?: string, join?: "za" | "·"): Segment => ({
    from: at(a), to: at(b), kind, title, subtitle, countdownTo: countdownMin == null ? null : at(countdownMin), live, ...(lead ? { lead, join } : {}),
  });

  const active = slots.filter((s) => !s.cancelled);
  if (!active.length) return [seg(0, 1440, "none", "Dnes bez hodin", allDay ?? "")];
  const school = active.filter((s) => !s.selfStudy);
  if (!school.length) return [seg(0, 1440, "home", SELF_STUDY, "Dnes můžeš být doma")];

  // hranice úseků: začátky a konce hodin a okamžik 90 minut před první hodinou (od něj se ukazuje „Škola začíná“)
  const first = school[0];
  const edges = new Set<number>([0, 1440, first.begin - 90]);
  for (const s of active) {
    edges.add(s.begin);
    edges.add(s.end);
  }
  const sorted = [...edges].filter((m) => m >= 0 && m <= 1440).sort((a, b) => a - b);

  const out: Segment[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const s = dayState(slots, (a + b) / 2); // stav uprostřed úseku = stav celého úseku
    switch (s.kind) {
      case "none":
      case "home":
        break;
      case "before":
        if (s.home) out.push(seg(a, b, "before", `${SELF_STUDY}, doma`, `Do školy až na ${fmtMin(s.first.begin)} · ${s.first.subject}`));
        else if (s.minutes <= 90) out.push(seg(a, b, "before", "Škola začíná", `${s.first.subject}${room(s.first)}`, s.first.begin, true, "Škola", "za"));
        else out.push(seg(a, b, "before", `Škola od ${fmtMin(s.first.begin)}`, `${s.first.subject}${room(s.first)}`));
        break;
      case "in":
        out.push(
          s.slot.selfStudy
            ? seg(a, b, "in", SELF_STUDY, `Můžeš být doma · ${s.slot.subject}`, s.slot.end, true, SELF_STUDY, "·")
            : seg(a, b, "in", "Zvonění", `${s.slot.subject}${room(s.slot)}`, s.slot.end, true, "Zvonění", "za"),
        );
        break;
      case "break":
        out.push(seg(a, b, "break", "Přestávka", s.next.selfStudy ? `Pak samostudium: ${s.next.subject}` : `Pak ${midSentence(s.next.subject)}${room(s.next)}`, s.next.begin, true, "Přestávka", "·"));
        break;
      case "after":
        out.push(seg(a, b, "after", "Po škole", `Končil jsi v ${fmtMin(s.last.end)}`));
        break;
    }
  }
  return out;
}

/** Poslední známky z paměti (bez sítě; synchronizace na pozadí je drží čerstvé), nejnovější první. */
function latestMarks(user: User, limit: number) {
  const data = peekMarks(user);
  if (!data) return [];
  return data.subjects
    .flatMap((sub) => sub.marks.map((m) => ({ subject: sub.name, caption: m.caption || m.theme || "", value: m.text || (m.value == null ? "" : String(m.value)), weight: m.weight, date: m.date, isNew: m.isNew, id: m.id })))
    .filter((m) => m.value)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map(({ id, ...m }) => m); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Obědy nejbližších dnů se Strava.cz (jen má-li uživatel propojený účet); dlouhé čekání na Strava.cz nesmí zdržet widget. */
async function lunchDays(userId: number, today: string) {
  if (!stravaAccount(userId)) return null;
  try {
    const r = await Promise.race([stravaMenu(userId), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
    return r.days
      .filter((d) => !d.closed && d.date >= today && d.meals.some(isLunch))
      .slice(0, 3)
      .map((d) => ({ date: d.date, meals: d.meals.filter(isLunch).map((m) => ({ soup: m.soup, kind: m.soup ? "Polévka" : m.label, name: m.name, price: m.price, ordered: m.ordered })) }));
  } catch {
    return null;
  }
}

export async function buildSnapshot(user: User, nowMs = Date.now()) {
  const today = pragueNow(new Date(nowMs)).date;
  const thisMonday = mondayOf(today);
  const nextMonday = addDays(thisMonday, 7);
  const thisWeek = (await getTimetable(user, "this")).data ?? null;
  const nextWeek = peekTimetable(user, "next"); // příští týden jen z paměti: stahuje ho synchronizace na pozadí
  const hues = subjectHues(user.class_id);

  const segments: Segment[] = [];
  const lessons: SnapshotLesson[] = [];
  for (let i = 0; i < SNAPSHOT_DAYS; i++) {
    const date = addDays(today, i);
    const dow = dowOf(date);
    const monday = mondayOf(date);
    const tt: Timetable | null = monday === thisMonday ? thisWeek : monday === nextMonday ? nextWeek : null;
    if (dow > 5 || !tt) continue; // bez rozvrhu se nic nepředstírá, aplikace ukáže „bez hodin“
    const slots = buildSlots(tt, dow, hues);
    segments.push(...daySegments(date, slots, tt.days.find((d) => d.day === dow)?.description));
    for (const s of slots) {
      lessons.push({
        hour: s.hour, subject: s.subject, hue: s.hue, room: s.room ?? "", teacher: s.teacher ?? "",
        begin: pragueMs(date, s.begin), end: pragueMs(date, s.end), beginText: fmtMin(s.begin), endText: fmtMin(s.end),
        cancelled: s.cancelled, selfStudy: !!s.selfStudy, change: s.change ?? null,
      });
    }
  }
  const openTasks = listTasks(user.id, user.class_id, false);
  const tasks = openTasks.slice(0, 12).map((t) => ({ title: t.title, subject: t.subject_name ?? "", hue: t.hue ?? "gray", due: t.due_date }));
  const tests = listTests(user.id, user.class_id, today, addDays(today, 30)).filter((t) => !t.makeup || t.attend === 1).slice(0, 10).map((t) => ({ subject: t.subject_name, topic: t.topic, date: t.date, hue: t.hue, makeup: !!t.makeup, oral: !!t.oral }));
  return {
    v: 1, generatedAt: nowMs, push: fcmEnabled(), tz: TZ, user: { name: user.name }, unread: unreadCount(user.id), segments, lessons,
    tasks, tasksOpen: openTasks.length, tests, marks: latestMarks(user, 8), lunch: await lunchDays(user.id, today),
  };
}
