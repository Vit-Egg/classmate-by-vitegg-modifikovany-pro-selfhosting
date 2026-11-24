import { credit } from "@/lib/credit";
import { startTimes } from "@/lib/starttime";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SyncNotice } from "@/components/SyncNotice";
import { monthShort, dayName, dayShort, dowOf, fmtShort, hhmm, pragueNow, relativeDay } from "@/lib/dates";
import { roomText } from "@/lib/selfstudy";
import { requireUser } from "@/lib/session";
import { subjectMates } from "@/lib/classmates";
import { subjectDetail } from "@/lib/subjects";
import { SubjectSummary } from "@/components/SubjectSummary";
import { getPref } from "@/lib/prefs";
import { summaryEnabled } from "@/lib/summary";
import type { Mark } from "@/lib/types";

export const metadata = { title: "Předmět" };
export const dynamic = "force-dynamic";

const cs = (n: number) => n.toFixed(2).replace(".", ",");
const gradeClass = (m: Mark) => (m.value == null ? "" : ` g${Math.min(5, Math.max(1, Math.round(m.value + 0.01)))}`);

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const d = await subjectDetail(user, Number((await params).id));
  if (!d) notFound();
  const today = pragueNow().date;
  const startAt = startTimes(user);
  const { subject: s } = d;
  const absPct = d.absence && d.absence.lessons ? Math.round((d.absence.missed / d.absence.lessons) * 100) : null;
  const nextTest = d.tests[0];
  const mates = subjectMates(user, s.id);

  return (
    <div className="wide" style={{ ["--hue" as string]: `var(--h-${s.hue})` }}>
      <Link href="/predmety" className="link-all">← Předměty</Link>
      <div className="page-head" style={{ marginTop: 14 }}>
        <div>
          <h1 className="title subj-title"><span className="dot" />{s.name}</h1>
          <p className="subtitle">{[d.teachers.join(", "), d.rooms.length ? `učebna ${d.rooms.join(", ")}` : "", d.selfStudyHours ? (d.selfStudyHours === d.slots.length ? "samostudium (můžeš být doma)" : `z toho ${d.selfStudyHours}× samostudium`) : "", d.slots.length ? `${d.slots.length}× týdně` : ""].filter(Boolean).join(" · ") || "Zatím bez rozvrhu"}</p>
        </div>
      </div>
      {d.stale && <SyncNotice result={{ data: null, stale: true, error: "network" }} />}

      <div className="stat-row">
        <div className="stat"><small>Průměr</small><b>{d.average != null ? cs(d.average) : "–"}</b></div>
        <div className="stat"><small>Další test nebo zkoušení</small><b>{nextTest ? relativeDay(nextTest.date, today) : "žádný"}</b></div>
        <div className="stat"><small>Úkoly</small><b>{d.tasks.length}</b></div>
        <div className="stat"><small>Absence</small><b>{absPct != null ? `${absPct} %` : "–"}</b></div>
      </div>

      {summaryEnabled() && !user.demo && <SubjectSummary subjectId={s.id} consented={getPref(user, "ai_sum") === "1"} />}

      <div className="grid-2">
        <div className="stack-lg">
          <section>
            <div className="section-head"><h2 className="section">Rozvrh</h2><Link href="/rozvrh?t=staly" className="link-all">Stálý rozvrh →</Link></div>
            {d.slots.length ? (
              <div className="card rows">
                {d.slots.map((x) => (
                  <div key={`${x.day}-${x.hour}`} className="item">
                    <div className="date-badge"><b>{dayShort(x.day)}</b><span>{x.hour}.</span></div>
                    <div className="item-main">
                      <div className="item-title">{dayName(x.day)}, {x.hour}. hodina</div>
                      <div className="item-meta">{x.begin && x.end && <span>{hhmm(x.begin)}–{hhmm(x.end)}</span>}{x.room && <span>{roomText(x.room)}</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Předmět není ve stálém rozvrhu.</div>}
            {d.nextLessons.length > 0 && (
              <p className="hint" style={{ margin: "10px 4px 0" }}>
                Nejbližší hodiny: {d.nextLessons.map((l) => `${relativeDay(l.date, today)} (${l.hour}. hodina${l.room ? `, ${roomText(l.room)}` : ""}${l.change ? `, ${l.change.toLowerCase()}` : ""})`).join(" · ")}
              </p>
            )}
          </section>

          <section>
            <div className="section-head"><h2 className="section">Co jsme probírali</h2></div>
            {d.themes.length ? (
              <div className="card rows">
                {d.themes.map((t, i) => (
                  <div key={i} className="item">
                    <div className="item-main">
                      <div className="item-title">{t.theme}</div>
                      <div className="item-meta"><span>{dayShort(dowOf(t.date))} {fmtShort(t.date)} · {t.hour}. hodina</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Z posledních týdnů tu nejsou zapsaná žádná témata hodin.</div>}
          </section>

          <section>
            <div className="section-head"><h2 className="section">Známky</h2><Link href="/znamky" className="link-all">Všechny známky →</Link></div>
            {d.marks.length ? (
              <div className="card rows">
                {d.marks.slice(0, 8).map((m) => (
                  <div key={m.id} className="mark-row">
                    <div className={`mark${gradeClass(m)}`}>{m.text || "–"}</div>
                    <div><div className="t">{m.caption}</div><div className="m"><span>{fmtShort(m.date)}</span><span>váha {m.weight}</span></div></div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Zatím žádné známky.</div>}
          </section>
        </div>

        <div className="stack-lg">
          {mates.length > 0 && (
            <section>
              <div className="section-head"><h2 className="section">Registrovaní spolužáci s tímto předmětem</h2></div>
              <div className="card" style={{ padding: "14px 18px", display: "grid", gap: 14 }}>
                {mates.map((g) => (
                  <div key={g.group}>
                    <p className="hint" style={{ margin: "0 0 8px" }}>{g.wholeClass ? "Celá třída" : g.group} · {g.people.length}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {g.people.map((p) => <span key={p.id} className="chip plain">{p.name}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="section-head"><h2 className="section">Testy a zkoušení</h2><Link href="/testy-a-zkouseni" className="link-all">Vše →</Link></div>
            {d.tests.length ? (
              <div className="card rows">
                {d.tests.map((t) => (
                  <div key={t.id} className="item">
                    <div className="date-badge"><b>{Number(t.date.slice(8))}</b><span>{dayShort(dowOf(t.date))} · {monthShort(t.date)}</span></div>
                    <div className="item-main">
                      <div className="item-title">{t.topic || (t.oral ? "Zkoušení" : "Test")}</div>
                      <div className="item-meta"><span className="chip">{t.oral ? "Zkoušení" : "Test"}</span>{t.makeup ? <span className="chip plain">Náhradní termín</span> : null}<span>{[`${fmtShort(t.date)} · ${relativeDay(t.date, today)}`, startAt(t.date, t.subject_name)].filter(Boolean).join(" · ")}</span>{credit(t, user.id).text && <span className="by">{credit(t, user.id).text}</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Žádný test ani zkoušení se nechystá.</div>}
          </section>

          <section>
            <div className="section-head"><h2 className="section">Úkoly</h2><Link href="/ukoly" className="link-all">Vše →</Link></div>
            {d.tasks.length ? (
              <div className="card rows">
                {d.tasks.map((t) => (
                  <div key={t.id} className="item">
                    <div className="item-main">
                      <div className="item-title">{t.title}</div>
                      <div className="item-meta">{t.due_date && <span>{[`${fmtShort(t.due_date)} · ${relativeDay(t.due_date, today)}`, startAt(t.due_date, t.subject_name)].filter(Boolean).join(" · ")}</span>}{credit(t, user.id).text && <span className="by">{credit(t, user.id).text}</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Žádné otevřené úkoly.</div>}
          </section>

          <section>
            <div className="section-head"><h2 className="section">Poznámky</h2><Link href={`/poznamky?s=${s.id}`} className="link-all">Vše →</Link></div>
            {d.ownNotes.length || d.sharedNotes.length ? (
              <div className="card rows">
                {d.ownNotes.map((n) => (
                  <Link key={n.id} href={`/poznamky/${n.id}`} className="item"><div className="item-main"><div className="item-title">{n.title || "Bez názvu"}</div></div></Link>
                ))}
                {d.sharedNotes.map((n) => (
                  <Link key={`s${n.id}`} href={`/poznamky/${n.id}`} className="item"><div className="item-main"><div className="item-title">{n.title || "Bez názvu"}</div><div className="item-meta"><span>sdílí {n.author}</span></div></div></Link>
                ))}
              </div>
            ) : <div className="empty">K předmětu zatím nemáš žádné poznámky.</div>}
          </section>

          {d.absence && (
            <section>
              <div className="section-head"><h2 className="section">Absence</h2><Link href="/absence" className="link-all">Vše →</Link></div>
              <div className="card card-pad">
                <p style={{ margin: 0 }}>Zameškáno <b>{d.absence.missed}</b> z {d.absence.lessons} hodin{absPct != null && <> ({absPct} %)</>}{d.absence.late ? `, pozdě ${d.absence.late}×` : ""}.</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
