import { FilterBar } from "@/components/FilterBar";
import { LiveSearch } from "@/components/LiveSearch";
import { fold } from "@/lib/text";
import { MarkChartButton } from "@/components/MarkChart";
import { GradeStrip, gradeCounts } from "@/components/GradeDistribution";
import { ChartFilters } from "@/components/ChartFilters";
import { ChartsFold } from "@/components/ChartsFold";
import { averageHistory, classPersonalAverage, markStats, type MarkStat } from "@/lib/stats";
import { SyncNotice } from "@/components/SyncNotice";
import { MarkDist } from "@/components/MarkDist";
import { MarkPredictor } from "@/components/MarkPredictor";
import { MarksTabs, type MarksPane } from "@/components/MarksTabs";
import { NSwitch } from "@/components/NSwitch";
import { getPref } from "@/lib/prefs";
import { subjectHues } from "@/lib/content";
import { dayShort, dowOf, fmtShort, plural } from "@/lib/dates";
import { weightedAverage } from "@/lib/normalize";
import { requireUser } from "@/lib/session";
import { getFinal, getMarks } from "@/lib/sync";
import type { Mark } from "@/lib/types";
import { all } from "@/lib/db";

export const metadata = { title: "Známky" };
export const dynamic = "force-dynamic";

const cs = (n: number) => n.toFixed(2).replace(".", ",");
const gradeClass = (m: Mark) => (m.value == null ? "" : ` g${Math.min(5, Math.max(1, Math.round(m.value + 0.01)))}`);
const when = (iso: string) => (iso ? `${dayShort(dowOf(iso))} ${fmtShort(iso)}` : "");

function MarkRow({ m, chip, stat }: { m: Mark; chip?: string; stat?: MarkStat }) {
  return (
    <div className={`mark-row${m.value != null && m.date ? " clickable" : ""}`} {...(m.value != null && m.date ? { "data-mark": m.id, role: "button", tabIndex: 0, title: "Ukázat, jak to dopadlo ostatním" } : {})}>
      <div className={`mark${gradeClass(m)}`}>{m.text || "–"}{m.isNew && <i className="new-dot" title="Nová známka" />}</div>
      <div>
        <div className="t">{m.caption}</div>
        <div className="m">
          {chip && <span className="chip" style={{ ["--hue" as string]: `var(--h-${chip})` }}>{m.subject}</span>}
          <span>{when(m.date)}</span>
          <span>váha {m.weight}</span>
          {stat && <span className="chip plain" title={`Průměr ${stat.n} lidí, kteří anonymně sdílejí známky`}>Ø ostatních {stat.avg.toFixed(2).replace(".", ",")} · {stat.n}</span>}
          {stat?.better != null && <span className="chip" title="Podíl ostatních, kteří na téhle známce dopadli hůř než ty (kdo má stejnou známku, se nepočítá)">lepší než {stat.better} %</span>}
        </div>
      </div>
    </div>
  );
}

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ q?: string; r?: string; p?: string; z?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rawQ = (sp.q ?? "").trim();
  const q = fold(rawQ);
  const [result, finalRes] = await Promise.all([getMarks(user), getFinal(user)]);
  // hledá v názvu známky, tématu, předmětu i v samotné známce (např. „4“ nebo „N“)
  const matches = (m: Mark, subject: string) => !q || fold(`${m.caption} ${m.theme} ${subject} ${m.text}`).includes(q);
  // N a podobné známky (bez číselné hodnoty) jdou skrýt v celém modulu; volba se pamatuje u účtu
  const showN = getPref(user, "marks_n") !== "0";
  const isN = (m: Mark) => m.value == null && m.percent == null; // procenta a body bez známky nejsou N
  const hasN = (result.data?.subjects ?? []).some((s) => s.marks.some(isN));
  const allSubjects = (result.data?.subjects ?? []).map((s) => (showN ? s : { ...s, marks: s.marks.filter((m) => !isN(m)) })).filter((s) => s.marks.length);
  const gradeOf = (m: Mark) => (m.value == null ? (m.percent == null ? 0 : -1) : Math.min(5, Math.max(1, Math.round(m.value + 0.01))));
  const avgOf = (s: (typeof allSubjects)[number]) => (s.averageText ? Number(s.averageText.replace(",", ".")) : weightedAverage(s.marks));
  const filtering = !!(rawQ || sp.p || sp.z);
  let subjects = allSubjects
    .filter((s) => !sp.p || s.name === sp.p)
    .map((s) => ({ ...s, marks: s.marks.filter((m) => matches(m, s.name) && (!sp.z || gradeOf(m) === (sp.z === "n" ? 0 : Number(sp.z)))) }))
    .filter((s) => s.marks.length);
  // řazení předmětů: nejlepší / nejhorší průměr, abecedně, podle nejnovější známky
  const avgBy = new Map(allSubjects.map((s) => [s.id, avgOf(s)]));
  const newest = (s: (typeof subjects)[number]) => s.marks.reduce((a, m) => (m.date > a ? m.date : a), "");
  const order = sp.r === "nej" ? (a: (typeof subjects)[number], b: (typeof subjects)[number]) => (avgBy.get(a.id) || 9) - (avgBy.get(b.id) || 9)
    : sp.r === "nejhorsi" ? (a: (typeof subjects)[number], b: (typeof subjects)[number]) => (avgBy.get(b.id) || 0) - (avgBy.get(a.id) || 0)
    : sp.r === "abc" ? (a: (typeof subjects)[number], b: (typeof subjects)[number]) => a.name.localeCompare(b.name, "cs")
    : sp.r === "nove" ? (a: (typeof subjects)[number], b: (typeof subjects)[number]) => newest(b).localeCompare(newest(a))
    : null;
  if (order) subjects = [...subjects].sort(order);
  // percentil je ve výchozím stavu skrytý a nabízí se jen tomu, kdo sám sdílí známky (Nastavení)
  const showPct = user.share_marks_stats === 1 && getPref(user, "marks_pct") === "1";
  const stats = result.data ? markStats(user, result.data) : new Map<string, MarkStat>();
  if (!showPct) for (const s of stats.values()) delete s.better;
  const hueByName = new Map(all<{ name: string; hue: string }>("SELECT name, hue FROM subjects WHERE class_id = ?", user.class_id).map((s) => [s.name, s.hue]));
  // celkové průměry: můj z průměrů všech předmětů (každý předmět stejně) a ostatních z celkových osobních průměrů spolužáků, kteří sdílí známky (až od tří lidí)
  const allMarks = allSubjects.flatMap((s) => s.marks);
  const subjectAvgs = allSubjects.map(avgOf).filter((a): a is number => a != null && Number.isFinite(a));
  const myOverall = subjectAvgs.length ? subjectAvgs.reduce((a, b) => a + b, 0) / subjectAvgs.length : null;
  const others = result.data ? classPersonalAverage(user, result.data, showPct ? myOverall : null) : null;
  const history = result.data ? averageHistory(user, result.data) : null;
  const counts = (vals: (number | null)[]) => gradeCounts(vals);
  const latest = allSubjects.flatMap((s) => s.marks).sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id)).slice(0, 8);
  void subjectHues;
  // předběžné (čtvrtletní, průběžné) známky zapsané učiteli a vysvědčení; obojí je jen ke čtení z Bakalářů
  const terms = (finalRes.data?.terms ?? []).filter((t) => t.marks.length);
  const tempGrade = (t: string) => { const n = Number(t.replace(",", ".").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n >= 1 && n <= 5 ? ` g${Math.round(n)}` : ""; };

  return (
    <div className="wide">
      <MarkDist />
      <div className="page-head">
        <div>
          <h1 className="title">Známky</h1>
          <p className="subtitle">Tvoje známky a průměry</p>
        </div>
        {hasN && <NSwitch on={showN} />}
      </div>
      <SyncNotice result={result} />
      {result.data && !allSubjects.length && <div className="empty">Zatím žádné známky.</div>}
      {allSubjects.length > 0 && (
        <ChartsFold
          summary={
            <>
              {myOverall != null && <span className="cf-chip" title="Průměr z průměrů všech předmětů"><small>Můj průměr</small> <b>{cs(myOverall)}</b></span>}
              {others && <span className="cf-chip" title="Průměr z osobních průměrů spolužáků, kteří anonymně sdílejí známky"><small>Třída</small> <b>{cs(others.avg)}</b></span>}
              {others?.better != null && <span className="cf-chip" title="Podíl ostatních, kteří mají horší celkový průměr než ty"><small>Lepší než</small> <b>{others.better} %</b></span>}
            </>
          }
        >
          <ChartFilters
            marks={allSubjects.flatMap((s) => s.marks.filter((m) => m.date).map((m) => ({ s: s.name, d: m.date, v: m.value, w: m.weight || 1, numeric: m.value != null || m.percent == null })))}
            history={history}
            subjects={allSubjects.map((s) => s.name)}
            classEmpty="Průměr třídy se ukáže, až budou anonymně sdílet známky aspoň tři spolužáci."
            classPie
          />
        </ChartsFold>
      )}
      {allSubjects.length > 0 && (
        <MarksTabs
          initial={filtering ? "subjects" : "latest"}
          tabs={[{ id: "latest", label: "Nejnovější" }, { id: "subjects", label: "Podle předmětů" }, { id: "predictor", label: "Předvídač" }, ...(terms.length ? [{ id: "final" as MarksPane, label: "Vysvědčení" }] : [])]}
        >
          <div data-pane="predictor">
          <div className="span-all"><MarkPredictor subjects={allSubjects.map((s) => ({ name: s.name, hue: hueByName.get(s.name) ?? "gray", marks: s.marks.filter((m) => m.value != null).map((m) => ({ value: m.value!, weight: m.weight })) })).filter((s) => s.marks.length)} /></div>
          </div>
          {terms.length > 0 && (
            <div data-pane="final">
            <section className="span-all">
              <h2 className="section" style={{ marginBottom: 12, padding: "0 4px" }}>Vysvědčení</h2>
              {terms.map((t, i) => (
                <details key={`${t.year}-${t.semester}`} className="card final-term" open={i === 0}>
                  <summary>
                    <b>{t.year} · {t.semesterName || t.semester} pololetí</b>
                    <span className="final-meta">
                      {t.average != null && <span className="chip">Ø {cs(t.average)}</span>}
                      {t.achievement && <span className="chip plain">{t.achievement}</span>}
                      {!t.closed && <span className="chip plain">Neuzavřeno</span>}
                    </span>
                  </summary>
                  <div className="final-marks">
                    {t.marks.map((m) => (
                      <div key={m.subject} className="final-mark"><span className={`mark${tempGrade(m.text)}`}>{m.text}</span><span>{m.subject}</span></div>
                    ))}
                  </div>
                  {(t.absent > 0 || t.notExcused > 0) && <p className="hint" style={{ margin: 0, padding: "0 18px 14px" }}>Zameškáno {t.absent} hod., z toho neomluveno {t.notExcused}.</p>}
                </details>
              ))}
            </section>
            </div>
          )}
          <div data-pane="latest">
          <section className="span-all">
            <h2 className="section" style={{ marginBottom: 12, padding: "0 4px" }}>Poslední známky</h2>
            <div className="card rows split">{latest.map((m) => <MarkRow key={m.id} m={m} chip={hueByName.get(m.subject) ?? "gray"} stat={stats.get(m.id)} />)}</div>
          </section>
          </div>
          <div data-pane="subjects">
          <hr className="divider" />
          <h2 className="group-title span-all">Podle předmětů</h2>
          <div className="span-all subj-filters">
        <div style={{ marginBottom: 22 }}><LiveSearch initial={rawQ} placeholder="Hledat známku, předmět nebo téma…" label="Hledat ve známkách" /></div>
        <FilterBar
          filters={[
            { param: "r", label: "Řadit předměty", all: "Jak je v Bakalářích", options: [{ value: "nej", label: "Od nejlepšího průměru" }, { value: "nejhorsi", label: "Od nejhoršího průměru" }, { value: "nove", label: "Podle nejnovější známky" }, { value: "abc", label: "Podle abecedy" }] },
            { param: "p", label: "Předmět", options: allSubjects.map((s) => ({ value: s.name, label: s.name })) },
            { param: "z", label: "Známka", options: [...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })), ...(showN ? [{ value: "n", label: "N a ostatní" }] : [])] },
          ]}
        />
          </div>
          {!subjects.length && <div className="empty span-all">Nic takového jsem nenašel.</div>}
          {subjects.map((s) => {
            const full = allSubjects.find((x) => x.id === s.id) ?? s;
            const avg = avgOf(full);
            const sorted = [...s.marks].sort((a, b) => b.date.localeCompare(a.date));
            return (
              <section key={s.id} style={{ ["--hue" as string]: `var(--h-${hueByName.get(s.name) ?? "gray"})` }}>
                <div className="subject-head">
                  <h3><span className="dot" />{s.name}{full.temporary && <span className="temp-mark" title={full.temporaryNote ? `Předběžná známka: ${full.temporaryNote}` : "Předběžná (čtvrtletní) známka zapsaná učitelem"}><span className={`mark${tempGrade(full.temporary)}`}>{full.temporary}</span><small>{full.temporaryNote || "čtvrtletí"}</small></span>}</h3>
                  <span className="avg"><GradeStrip counts={counts(full.marks.filter((m) => m.value != null || m.percent == null).map((m) => m.value))} /><MarkChartButton subject={s.name} hue={hueByName.get(s.name) ?? "gray"} marks={full.marks.filter((m) => m.value != null).map((m) => ({ id: m.id, date: m.date, value: m.value!, text: m.text, caption: m.caption, weight: m.weight, avg: stats.get(m.id)?.avg, n: stats.get(m.id)?.n }))} />{avg != null && !Number.isNaN(avg) && <>průměr<b>{cs(avg)}</b></>}</span>
                </div>
                <div className="card rows">
                  {(filtering ? sorted : sorted.slice(0, 3)).map((m) => <MarkRow key={m.id} m={m} stat={stats.get(m.id)} />)}
                  {!filtering && sorted.length > 3 && (
                    <details className="more-rows">
                      <summary>Další známky ({sorted.length - 3})</summary>
                      {sorted.slice(3).map((m) => <MarkRow key={m.id} m={m} stat={stats.get(m.id)} />)}
                    </details>
                  )}
                </div>
              </section>
            );
          })}
          </div>
        </MarksTabs>
      )}
    </div>
  );
}
