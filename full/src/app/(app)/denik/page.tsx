import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEntryAction, deleteReflectionAction, setTrainingAction } from "@/app/actions/denik";
import { ConfirmButton } from "@/components/forms";
import { EntryDialog, ReflectionDialog } from "@/components/TrainingDialogs";
import { IntervalsPanel, ProfileForm } from "@/components/TrainingForms";
import { dayShort, dowOf, fmtDateTime, fmtShort, plural, pragueNow } from "@/lib/dates";
import { defaultImportRange, intervalsAccount } from "@/lib/intervals";
import { requireUser } from "@/lib/session";
import { MAX_ENTRIES, TYPES, currentPeriod, getProfile, listEntries, listReflections, periodRange, schoolTrainingEnabled, summarize, trainingActive, trainingYears, weekStats, yearLabel } from "@/lib/training";

export const metadata = { title: "Tréninkový deník" };
export const dynamic = "force-dynamic";

const longDate = (iso: string) => `${dayShort(dowOf(iso))} ${fmtShort(iso)}${iso.slice(0, 4) !== pragueNow().date.slice(0, 4) ? ` ${iso.slice(0, 4)}` : ""}`;

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ z?: string; p?: string; k?: string }> }) {
  const user = await requireUser();
  if (!schoolTrainingEnabled(user.school_id)) notFound();
  const head = (sub: string) => <div className="page-head"><div><h1 className="title">Tréninkový deník</h1><p className="subtitle">{sub}</p></div></div>;

  if (!trainingActive(user)) {
    return (
      <div className="wide">
        {head("Deník pro program Aktivní sportovec")}
        <div className="card card-pad comm-connect">
          <h2 className="section" style={{ marginBottom: 6 }}>Tréninkový deník zatím není zapnutý</h2>
          <p className="hint" style={{ margin: "0 0 16px" }}>Zapisuješ tréninky, zápasy a týdenní reflexe (ručně, nebo z Intervals.icu) a na konci pololetí si stáhneš tabulku, kterou škola vyžaduje.</p>
          <form action={setTrainingAction}><input type="hidden" name="enabled" value="1" /><button className="btn primary">Zapnout tréninkový deník</button></form>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const now = currentPeriod();
  const years = trainingYears(user.id);
  const year = years.includes(Number(sp.z)) ? Number(sp.z) : now.year;
  const half = (sp.p === "1" ? 1 : sp.p === "2" ? 2 : year === now.year ? now.half : 1) as 1 | 2;
  const tab = sp.k === "reflexe" || sp.k === "udaje" ? sp.k : "zapisy";
  const href = (o: { z?: number; p?: number; k?: string }) => `/denik?z=${o.z ?? year}&p=${o.p ?? half}&k=${o.k ?? tab}`;
  const today = pragueNow().date;
  const entries = listEntries(user.id, year, half);
  const sum = summarize(entries);
  const reflections = listReflections(user.id, year, half);
  const range = periodRange(year, half);
  const acc = intervalsAccount(user.id);
  const imp = defaultImportRange();

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Tréninkový deník</h1>
          <p className="subtitle">Aktivní sportovec · {yearLabel(year)}, {half}. pololetí</p>
        </div>
        <div className="tt-actions">
          <a className="btn small" href={`/denik/export?z=${year}`} download>Stáhnout tabulku (.xlsx)</a>
          {tab === "reflexe" ? <ReflectionDialog today={today} /> : tab === "zapisy" ? <EntryDialog types={TYPES} today={today} /> : null}
        </div>
      </div>
      <div className="toolbar">
        <nav className="seg" aria-label="Část deníku">
          {[["zapisy", "Zápisy"], ["reflexe", "Týdenní reflexe"], ["udaje", "Údaje a Intervals.icu"]].map(([k, l]) => <Link key={k} href={href({ k })} aria-current={tab === k}>{l}</Link>)}
        </nav>
        <div className="btn-row">
          <nav className="seg" aria-label="Pololetí">
            {[1, 2].map((h) => <Link key={h} href={href({ p: h })} aria-current={half === h}>{h}. pololetí</Link>)}
          </nav>
          {years.length > 1 && (
            <nav className="seg" aria-label="Školní rok">
              {years.map((y) => <Link key={y} href={href({ z: y })} aria-current={y === year}>{yearLabel(y)}</Link>)}
            </nav>
          )}
        </div>
      </div>

      {tab === "zapisy" && (
        <>
          <div className="stats auto" style={{ marginBottom: 22 }}>
            <div className="card stat"><b>{sum.hours.toString().replace(".", ",")}</b><span>hodin ({sum.minutes} min)</span></div>
            <div className="card stat"><b>{sum.trainings}</b><span>{plural(sum.trainings, "trénink", "tréninky", "tréninků")} a soutěží</span></div>
            <div className="card stat"><b>{sum.matches}</b><span>zápasů a závodů</span></div>
            <div className="card stat"><b>{sum.avgRpe === null ? "–" : String(sum.avgRpe).replace(".", ",")}</b><span>průměrné RPE</span></div>
          </div>
          {entries.length === 0 ? (
            <div className="empty">V tomhle pololetí (od {fmtShort(range.from)} do {fmtShort(range.to)}) zatím nic není. Přidej první zápis, nebo načti aktivity z Intervals.icu v části Údaje.</div>
          ) : (
            <div className="card rows">
              {entries.map((e) => (
                <div key={e.id} className="item tr-item">
                  <div className="tr-date"><b>{fmtShort(e.date)}</b><span>{dayShort(dowOf(e.date))}</span></div>
                  <div className="item-main">
                    <div className="item-title">{e.content || e.type}</div>
                    <div className="item-meta">
                      <span className="chip plain">{e.type}</span>
                      <span>{e.minutes} min</span>
                      {e.rpe !== null && <span>RPE {e.rpe}</span>}
                      {e.source === "intervals" && <span className="chip plain">Intervals.icu</span>}
                      {!e.goal && !e.note && e.type !== "Volno" && e.type !== "Regenerace" && <span className="tr-todo">chybí cíl a zhodnocení</span>}
                    </div>
                    {e.goal && <div className="item-note"><b>Cíl:</b> {e.goal}</div>}
                    {e.note && <div className="item-note">{e.note}</div>}
                  </div>
                  <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                    <EntryDialog small types={TYPES} today={today} entry={{ id: e.id, date: e.date, type: e.type, minutes: e.minutes, rpe: e.rpe ?? "", content: e.content, goal: e.goal, note: e.note }} />
                    <form action={deleteEntryAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <ConfirmButton className="icon-btn" message="Smazat zápis? Nejde to vrátit.">✕</ConfirmButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
          {entries.length >= MAX_ENTRIES - 10 && <p className="hint" style={{ marginTop: 12 }}>Tabulka pojme {MAX_ENTRIES} zápisů na pololetí, máš jich {entries.length}.</p>}
        </>
      )}

      {tab === "reflexe" && (
        reflections.length === 0 ? (
          <div className="empty">Týdenní reflexe zatím nejsou. Jednou týdně zapiš konkrétní pokrok, co příště upravíš a jak se ti dařilo.</div>
        ) : (
          <div className="card rows">
            {reflections.map((r) => {
              const st = weekStats(user.id, r.week_from, r.week_to);
              return (
                <div key={r.id} className="item tr-item">
                  <div className="tr-date"><b>{fmtShort(r.week_from)}</b><span>– {fmtShort(r.week_to)}</span></div>
                  <div className="item-main">
                    <div className="item-title">{r.goal || "Bez cíle týdne"}</div>
                    <div className="item-meta"><span>{st.n} {plural(st.n, "aktivita", "aktivity", "aktivit")}, {st.m} min</span>{r.rating !== null && <span className="chip plain">sebehodnocení {r.rating}/5</span>}</div>
                    {r.achieved && <div className="item-note"><b>Podařilo se:</b> {r.achieved}</div>}
                    {r.improve && <div className="item-note"><b>Příště:</b> {r.improve}</div>}
                  </div>
                  <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                    <ReflectionDialog small today={today} refl={{ id: r.id, week: r.week_from, goal: r.goal, achieved: r.achieved, improve: r.improve, rating: r.rating ?? "" }} />
                    <form action={deleteReflectionAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton className="icon-btn" message="Smazat reflexi? Nejde to vrátit.">✕</ConfirmButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "udaje" && (
        <div className="auto-cols">
          <section>
            <h2 className="section" style={{ marginBottom: 12 }}>Údaje do tabulky</h2>
            <div className="card card-pad"><ProfileForm p={getProfile(user.id)} year={yearLabel(year)} /></div>
            <form action={setTrainingAction} style={{ marginTop: 14 }}>
              <input type="hidden" name="enabled" value="0" />
              <ConfirmButton message="Vypnout tréninkový deník? Záznamy zůstanou uložené, po novém zapnutí jsou zpět.">Vypnout deník</ConfirmButton>
            </form>
          </section>
          <section>
            <h2 className="section" style={{ marginBottom: 12 }}>Intervals.icu</h2>
            <div className="card card-pad">
              <IntervalsPanel connected={!!acc} athlete={acc?.athlete_id ?? "0"} lastSync={acc?.last_sync_at ? fmtDateTime(acc.last_sync_at) : ""} from={imp.from} to={imp.to} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
