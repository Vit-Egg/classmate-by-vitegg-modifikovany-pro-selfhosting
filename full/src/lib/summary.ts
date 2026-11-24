/**
 * Shrnutí předmětu: ze známek, témat hodin, testů, úkolů a vlastních poznámek sestaví souhrn přes Gemini API (volná úroveň).
 * Souhrn se vytvoří až při otevření předmětu a platí do konce půldne (dělicí čára je poledne), pak se při dalším otevření obnoví.
 * Do modelu se neposílá jméno ani e-mail. Položky „jen pro mě“ se zahrnují, jsou to uživatelovy vlastní podklady (např. test, který si hlídá jen on).
 */
import { aiEnabled, generateText } from "./ai";
import { get, run } from "./db";
import { diffDays, fmtShort, inDays, pragueNow } from "./dates";
import type { User } from "./session";
import type { SubjectDetail } from "./subjects";

export const summaryEnabled = aiEnabled;

/** Půlden: „2026-10-23-a“ do 11:59, „2026-10-23-p“ od 12:00. */
export const slotOf = (now = new Date()) => {
  const n = pragueNow(now);
  return `${n.date}-${n.hour < 12 ? "a" : "p"}`;
};

type Stored = { slot: string; text: string; created_at: number };
export type Summary = { text: string; createdAt: number; stale: boolean };

const stored = (userId: number, subjectId: number) => get<Stored>("SELECT slot, text, created_at FROM subject_summaries WHERE user_id = ? AND subject_id = ?", userId, subjectId);

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

/** Podklady pro model jako prostý text. Vše je soukromé uživatelovo, proto se hlídá množství i soukromé položky. */
function buildContext(user: User, d: NonNullable<SubjectDetail>, notes: { title: string; text: string }[]): string {
  const today = pragueNow().date;
  const out: string[] = [`Předmět: ${d.subject.name}`, `Dnes je ${fmtShort(today)}.`];
  if (d.teachers.length) out.push(`Vyučující: ${d.teachers.join(", ")}`);
  if (d.slots.length) out.push(`Hodin týdně: ${d.slots.length}`);
  if (d.marks.length) {
    out.push(`\nZnámky (nejnovější první; průměr ${d.average != null ? d.average.toFixed(2) : "neznámý"}):`);
    for (const m of d.marks.slice(0, 25)) out.push(`- ${fmtShort(m.date)}: ${m.text || "–"}, váha ${m.weight}, ${m.caption}${m.theme ? ` (${m.theme})` : ""}`);
  }
  if (d.themesAll.length) {
    out.push("\nTémata posledních hodin (nejnovější první):");
    for (const t of d.themesAll) out.push(`- ${fmtShort(t.date)}: ${t.theme}`);
  }
  const tests = d.tests;
  if (tests.length) {
    out.push("\nNadcházející testy a zkoušení:");
    for (const t of tests.slice(0, 6)) out.push(`- ${fmtShort(t.date)} (${inDays(diffDays(today, t.date))})${t.makeup ? ", náhradní termín" : ""}${t.private ? ", zapsáno jen pro sebe" : ""}${t.topic ? `: ${t.topic}` : ""}`);
  }
  const tasks = d.tasks;
  if (tasks.length) {
    out.push("\nOtevřené úkoly:");
    for (const t of tasks.slice(0, 10)) out.push(`- ${t.title}${t.due_date ? ` (do ${fmtShort(t.due_date)})` : ""}${t.private ? " [jen pro sebe]" : ""}`);
  }
  if (d.absence) out.push(`\nZameškáno ${d.absence.missed} z ${d.absence.lessons} hodin.`);
  if (notes.length) {
    out.push("\nVlastní poznámky z hodin (nejnovější první):");
    let budget = 9000;
    for (const n of notes) {
      const body = clip(n.text.replace(/\s+/g, " ").trim(), Math.min(2000, budget));
      budget -= body.length;
      out.push(`### ${n.title || "Bez názvu"}\n${body}`);
      if (budget <= 0) break;
    }
  }
  void user;
  return out.join("\n");
}

const PROMPT = `Jsi chytrý studijní pomocník pro studenta střední školy. Z podkladů o jednom předmětu napiš česky stručné shrnutí „kde teď jsem“.
Pravidla:
- Piš přímo studentovi („máš“, „čeká tě“), přátelsky, věcně, bez omáčky a bez úvodu typu „Tady je shrnutí“.
- Struktura: nejdřív 1–2 věty o celkovém stavu (známky, trend), pak odrážky začínající „- “ s tím, co jsme probírali a co je z poznámek důležité, a nakonec odrážky o tom, co student řešit teď (nejbližší test, úkoly, na co se zaměřit).
- Vycházej jen z podkladů. Nic si nevymýšlej; když něco chybí, tu část prostě vynech.
- Čísla a data uváděj přesně. Max. 170 slov, žádné nadpisy, žádné tučné písmo ani jiné formátování než odrážky.
- Nezmiňuj, že jsi umělá inteligence nebo jazykový model.`;

async function generate(context: string): Promise<{ text: string; model: string }> {
  return generateText({ system: PROMPT, user: context, temperature: 0.4, maxTokens: 1500 }, "summary");
}

const inflight = new Map<string, Promise<Summary>>();

/** Vrátí platné shrnutí; když chybí nebo je z minulého půldne, vytvoří nové. Souběžné požadavky sdílí jedno volání. */
export function subjectSummary(user: User, d: NonNullable<SubjectDetail>, notes: { title: string; text: string }[]): Promise<Summary> {
  const slot = slotOf();
  const have = stored(user.id, d.subject.id);
  if (have && have.slot === slot) return Promise.resolve({ text: have.text, createdAt: have.created_at, stale: false });
  const key = `${user.id}:${d.subject.id}:${slot}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async (): Promise<Summary> => {
    try {
      const { text, model } = await generate(buildContext(user, d, notes));
      const now = Date.now();
      run("INSERT OR REPLACE INTO subject_summaries (user_id, subject_id, slot, text, model, created_at) VALUES (?, ?, ?, ?, ?, ?)", user.id, d.subject.id, slot, text, model, now);
      return { text, createdAt: now, stale: false };
    } catch (e) {
      if (have) return { text: have.text, createdAt: have.created_at, stale: true }; // starší shrnutí je lepší než nic
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
