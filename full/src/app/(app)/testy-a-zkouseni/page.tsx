import Link from "next/link";
import { ReportButton } from "@/components/ReportButton";
import { startTimes } from "@/lib/starttime";
import { aiEnabled } from "@/lib/ai";
import { Clamp } from "@/components/Clamp";
import { credit } from "@/lib/credit";
import { createTest, deleteTest, setTestAttend, updateTest } from "@/app/actions/content";
import { Icon } from "@/components/Icon";
import { EditItemDialog } from "@/components/EditItemDialog";
import { ItemDialog } from "@/components/ItemDialog";
import { listPastTests, listTests } from "@/lib/content";
import { monthShort, dayName, dowOf, fmtShort, mondayOf, pragueNow, relativeDay, fmtDateTime } from "@/lib/dates";
import { subjectOptions } from "@/lib/options";
import { FilterBar } from "@/components/FilterBar";
import { WeekSwipe } from "@/components/WeekSwipe";
import { untilDate } from "@/lib/filters";
import { requireUser } from "@/lib/session";
import { getTimetable } from "@/lib/sync";

export const metadata = { title: "Testy a zkoušení" };
export const dynamic = "force-dynamic";

export default async function TestsPage({ searchParams }: { searchParams: Promise<{ new?: string; date?: string; edit?: string; s?: string; do?: string; v?: string }> }) {
  const user = await requireUser();
  await getTimetable(user, "permanent"); // kontrola dnů výuky potřebuje stálý rozvrh
  const today = pragueNow().date;
  const study = aiEnabled() && !user.demo;
  const sp = await searchParams;
  const until = untilDate(sp.do, today);
  const history = sp.v === "historie";
  const past = history ? listPastTests(user.id, user.class_id).filter((t) => !sp.s || t.subject_name === sp.s) : [];
  const tests = history ? [] : listTests(user.id, user.class_id, today, until ?? undefined).filter((t) => !sp.s || t.subject_name === sp.s);
  const hidden = history ? [] : listTests(user.id, user.class_id, today, undefined, { hidden: true });
  const startAt = startTimes(user);
  const thisWeek = mondayOf(today);
  const options = subjectOptions(user);
  const editId = Number((await searchParams).edit) || 0;
  const groups = new Map<string, typeof tests>();
  for (const t of tests) {
    const label = mondayOf(t.date) === thisWeek ? "Tento týden" : mondayOf(t.date) === mondayOf(new Date(Date.parse(thisWeek) + 7 * 86_400_000).toISOString().slice(0, 10)) ? "Příští týden" : `Týden od ${fmtShort(mondayOf(t.date))}`;
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }

  const renderTest = (t: (typeof tests)[number]) => (
    <div key={t.id} className={`item${t.makeup && t.attend == null ? " makeup-undecided" : ""}`}>
      <div className="date-badge"><b>{Number(t.date.slice(8))}</b><span>{dayName(dowOf(t.date)).slice(0, 2)} · {monthShort(t.date)}</span></div>
      <div className="item-main">
        <div className="item-title">{t.subject_name}</div>
        <div className="item-meta">
          <span className="chip" style={{ ["--hue" as string]: `var(--h-${t.hue})` }}>{relativeDay(t.date, today)}</span>
          {startAt(t.date, t.subject_name) && <span className="chip plain" title="Začátek první hodiny předmětu">{startAt(t.date, t.subject_name)}</span>}
          <span className="chip">{t.oral ? "Zkoušení" : "Test"}</span>
          {t.makeup ? <span className="chip plain">Náhradní termín</span> : null}
          {t.makeup ? (
            <span className="attend" role="group" aria-label="Píšeš tento náhradní termín?">
              <form action={setTestAttend}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="writes" value={t.attend === 1 ? "" : "1"} />
                <button className={`attend-btn${t.attend === 1 ? " on" : ""}`} aria-pressed={t.attend === 1} title={t.attend === 1 ? "Zrušit volbu" : "Píšu to"}>{t.attend === 1 ? "✓ Píšu" : "Píšu"}</button>
              </form>
              <form action={setTestAttend}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="writes" value="0" />
                <button className="attend-btn" title="Nepíšu to, skryje se">Nepíšu</button>
              </form>
            </span>
          ) : null}
          {t.group_label && <span className="chip plain">{t.group_label}</span>}
          {t.created_by !== user.id && t.created_by != null && <ReportButton what={`${t.oral ? "zkoušení" : "test"} ${t.subject_name} ${t.date} (/testy-a-zkouseni)`} />}
          {credit(t, user.id).text && <span className="by" title={t.updated_at ? `Naposledy upraveno ${fmtDateTime(t.updated_at)}` : "Kdo to zadal"}>{credit(t, user.id).text}</span>}
        </div>
        {t.topic && <Clamp text={t.topic} />}
      </div>
      {(study || t.created_by === user.id || user.role === "admin") && (
        <div className="item-actions">
          {study && <Link href={`/studium/${t.id}`} className="icon-btn" style={{ color: "var(--muted)" }} aria-label="Učit se na test nebo zkoušení" title="Učit se na test nebo zkoušení"><Icon name="cap" size={16} /></Link>}
          {(t.created_by === user.id || user.role === "admin") && <>
          <EditItemDialog item={{ kind: "test", id: t.id, subject: t.subject_name, date: t.date, topic: t.topic, makeup: !!t.makeup, oral: !!t.oral, days: options.find((o) => o.name === t.subject_name)?.days ?? [] }} action={updateTest} autoOpen={editId === t.id} />
          <form action={deleteTest}>
            <input type="hidden" name="id" value={t.id} />
            <button className="icon-btn" aria-label="Smazat test nebo zkoušení"><Icon name="trash" size={16} /></button>
          </form>
          </>}
        </div>
      )}
    </div>
  );

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Testy a zkoušení</h1>
          <p className="subtitle">{history ? "Co už proběhlo" : "Co tě čeká"}</p>
        </div>
        <ItemDialog kind="test" emptyHint="Test jde přidat jen k předmětu ze stálého rozvrhu." subjects={subjectOptions(user, true)} action={createTest} today={today} autoOpen={(await searchParams).new === "1"} defaultDate={/^\d{4}-\d{2}-\d{2}$/.test((await searchParams).date ?? "") ? (await searchParams).date : undefined} />
      </div>
      <div className="toolbar">
        <nav className="seg" aria-label="Pohled">
          <Link href="/testy-a-zkouseni" aria-current={!history}>Nadcházející</Link>
          <Link href="/testy-a-zkouseni?v=historie" aria-current={history}>Historie</Link>
        </nav>
      </div>
      {history ? (
        <>
          <FilterBar filters={[{ param: "s", label: "Předmět", options: options.map((s) => ({ value: s.name, label: s.name })) }]} />
          {past.length ? (
            <div className="card rows">
              {past.map((t) => (
                <div key={t.id} className="item">
                  <div className="date-badge"><b>{Number(t.date.slice(8))}</b><span>{dayName(dowOf(t.date)).slice(0, 2)} · {monthShort(t.date)}</span></div>
                  <div className="item-main">
                    <div className="item-title">{t.subject_name}</div>
                    <div className="item-meta">
                      <span className="chip" style={{ ["--hue" as string]: `var(--h-${t.hue})` }}>{fmtShort(t.date)} · {relativeDay(t.date, today)}</span>
                      <span className="chip">{t.oral ? "Zkoušení" : "Test"}</span>
                      {t.makeup ? <span className="chip plain">Náhradní termín</span> : null}
                      {t.group_label && <span className="chip plain">{t.group_label}</span>}
                      {credit(t, user.id).text && <span className="by">{credit(t, user.id).text}</span>}
                    </div>
                    {t.topic && <Clamp text={t.topic} />}
                  </div>
                  {(t.created_by === user.id || user.role === "admin") && (
                    <div className="item-actions">
                      <form action={deleteTest}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="icon-btn" aria-label="Smazat test nebo zkoušení"><Icon name="trash" size={16} /></button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">{sp.s ? "Filtru nic neodpovídá." : "Historie je zatím prázdná. Proběhlé testy a zkoušení se tu schovají, nic se nemaže."}</div>
          )}
        </>
      ) : (<>
      <FilterBar dateParam="do" dateLabel="Do data" filters={[{ param: "s", label: "Předmět", options: options.map((s) => ({ value: s.name, label: s.name })) }]} />
      {tests.length ? (
        <WeekSwipe labels={[...groups].map(([label]) => label)}>
          {[...groups].map(([label, list]) => {
            const days = [...new Map(list.map((t) => [t.date, list.filter((x) => x.date === t.date)])).entries()];
            return (
              <section key={label} className="wk-week">
                <h2 className="group-title">{label}</h2>
                <div className="wk-days">
                  {days.map(([date, list]) => (
                    <div key={date} className="wk-day">
                      <h3 className="day-title">{dayName(dowOf(date))} {fmtShort(date)}<span>{relativeDay(date, today)}</span></h3>
                      <div className="card rows">{list.map(renderTest)}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </WeekSwipe>
      ) : (
        <div className="empty">{sp.s || until ? "Filtru nic neodpovídá." : "Zatím žádný test ani zkoušení na obzoru."}</div>
      )}
      {hidden.length > 0 && (
        <details className="hidden-tests">
          <summary>Skryté náhradní termíny ({hidden.length})</summary>
          <div className="card rows">
            {hidden.map((t) => (
              <div key={t.id} className="item makeup-undecided">
                <div className="date-badge"><b>{Number(t.date.slice(8))}</b><span>{dayName(dowOf(t.date)).slice(0, 2)} · {monthShort(t.date)}</span></div>
                <div className="item-main">
                  <div className="item-title">{t.subject_name}</div>
                  <div className="item-meta"><span className="chip plain">{t.oral ? "Zkoušení" : "Test"} · nepíšeš</span></div>
                </div>
                <form action={setTestAttend} className="item-actions">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="writes" value="" />
                  <button className="btn small">Zase ukázat</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
      </>)}
    </div>
  );
}
