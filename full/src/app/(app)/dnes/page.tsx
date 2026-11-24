import { NowLine } from "@/components/NowLine";
import Link from "next/link";
import { startTimes } from "@/lib/starttime";
import { Fragment, Suspense } from "react";
import { TodayCustomize } from "@/components/TodayCustomize";
import { getPref } from "@/lib/prefs";
import { parseLayout } from "@/lib/today";
import { Clamp } from "@/components/Clamp";
import { DutyWidget } from "@/components/DutyWidget";
import { LunchWidget, LunchSkeleton } from "@/components/LunchWidget";
import { stravaAccount } from "@/lib/strava";
import { SyncNotice } from "@/components/SyncNotice";
import { DayLine, DayRuler } from "@/components/Live";
import { TaskCheck } from "@/components/TaskCheck";
import { buildSlots, dayState } from "@/lib/schedule";
import { dailyHoroscope, isSign, SIGNS } from "@/lib/horoscope";
import { SignPicker } from "@/components/HoroscopeWidget";
import { emptyTasks, emptyTests } from "@/lib/voice";
import { listTasks, listTests, subjectHues } from "@/lib/content";
import { monthShort, addDays, dayName, dayShort, diffDays, dowOf, mondayOf, fmtDateTime, fmtFull, fmtShort, greeting, hhmm, plural, pragueNow, relativeDay, vocative } from "@/lib/dates";
import { nextSchoolDay } from "@/lib/nextday";
import { isSelfStudy } from "@/lib/selfstudy";
import { requireUser } from "@/lib/session";
import { getAbsence, getMarks, getTimetable } from "@/lib/sync";
import { createNote } from "@/app/actions/notes";
import { openMessage } from "@/app/actions/messages";
import { all } from "@/lib/db";
import { calendarEvents } from "@/lib/calendar";
import { kc, myPayments } from "@/lib/cash";
import { getKomens } from "@/lib/komens";
import { listMessages } from "@/lib/messages";
import { absenceHours } from "@/lib/types";
import { celebrates, nameDayNames } from "@/lib/namedays";
import { classmates } from "@/lib/classmates";
import { namedAbsence } from "@/lib/normalize";
import { lessonItemsBetween, itemsForLesson } from "@/lib/lessonitems-data";
import { LessonTags } from "@/components/LessonTags";

export const metadata = { title: "Dnes" };
export const dynamic = "force-dynamic";

const toMin = (t: string) => Number(t.slice(0, t.indexOf(":"))) * 60 + Number(t.slice(t.indexOf(":") + 1));

export default async function TodayPage() {
  const user = await requireUser();
  const now = pragueNow();
  const dayNames = await nameDayNames(now.date);
  const mates = dayNames.length ? classmates(user.class_id) : [];
  const result = await getTimetable(user, "this");
  const hues = subjectHues(user.class_id);
  const hours = new Map((result.data?.hours ?? []).map((h) => [h.hour, h]));
  const lessons = (result.data?.lessons ?? []).filter((l) => l.day === now.dow).sort((a, b) => a.hour - b.hour);
  const slots = buildSlots(result.data, now.dow, hues);
  const allDay = result.data?.days.find((d) => d.day === now.dow)?.description;
  const free = now.dow > 5 || (!!result.data && lessons.length === 0); // víkend, prázdniny, svátek nebo jiný den bez výuky
  // po skončení výuky se místo dnešního rozvrhu ukáže zítřejší (jde vypnout v Nastavení)
  const afterSchool = !free && getPref(user, "after_tomorrow") !== "0" && dayState(slots, now.minutes).kind === "after";
  const nextWeek = free ? await getTimetable(user, "next") : null;
  const next = free ? nextSchoolDay(now.date, [{ monday: mondayOf(now.date), data: result.data }, { monday: addDays(mondayOf(now.date), 7), data: nextWeek?.data }]) : null;
  const untilNext = next ? diffDays(now.date, next.date) * 1440 - now.minutes + (next.begin ? toMin(next.begin) : 480) : 0;
  const reason = now.dow > 5 ? (now.dow === 6 ? "sobota" : "neděle") : allDay || "den bez výuky";
  const lunch = !!stravaAccount(user.id);
  const lunchBox = lunch && (
    <Suspense fallback={<LunchSkeleton />}>
      <LunchWidget userId={user.id} today={now.date} hour={now.hour} />
    </Suspense>
  );
  const startAt = startTimes(user);
  const tasks = listTasks(user.id, user.class_id, false).slice(0, 5);
  const tests = listTests(user.id, user.class_id, now.date, addDays(now.date, 21)).filter((t) => !t.makeup || t.attend === 1).slice(0, 4);

  // štítky Test / Zkoušení / Úkol u hodin dneška, zítřka a příští výuky
  const lessonItems = lessonItemsBetween(user, now.date, addDays(now.date, 14));

  const scheduleEl = free ? (
        <section>
          <div className="section-head">
            <h2 className="section">Volno</h2>
            <Link href="/rozvrh" className="link-all">Rozvrh →</Link>
          </div>
          <div className="card free-card">
            <div className="free-top">
              <span className="chip">{reason}</span>
              {allDay && now.dow <= 5 && <span className="free-note">celodenní událost</span>}
            </div>
            {next ? (
              <div className="free-count">
                <b>{untilNext >= 1440 ? `${Math.floor(untilNext / 1440)} ${plural(Math.floor(untilNext / 1440), "den", "dny", "dní")} ${Math.floor((untilNext % 1440) / 60)} h` : `${Math.floor(untilNext / 60)} h ${untilNext % 60} min`}</b>
                <span>do první hodiny · {dayName(dowOf(next.date)).toLowerCase()} {fmtShort(next.date)}{next.begin ? ` v ${hhmm(next.begin)}` : ""}</span>
              </div>
            ) : (
              <div className="free-count"><b>Zatím klid</b><span>V rozvrhu na příští týdny nejsou žádné hodiny.</span></div>
            )}
            {next && (
              <div className="free-stats">
                <div><b>{next.lessons.filter((l) => l.change?.kind !== "cancelled").length}</b><span>{plural(next.lessons.filter((l) => l.change?.kind !== "cancelled").length, "hodina", "hodiny", "hodin")} v ten den</span></div>
                <div><b>{tests.filter((t) => diffDays(now.date, t.date) <= 7).length}</b><span>{plural(tests.filter((t) => diffDays(now.date, t.date) <= 7).length, "test nebo zkoušení", "testy nebo zkoušení", "testů nebo zkoušení")} do týdne</span></div>
                <div><b>{tasks.filter((t) => t.due_date && t.due_date <= addDays(next.date, 1)).length}</b><span>{plural(tasks.filter((t) => t.due_date && t.due_date <= addDays(next.date, 1)).length, "úkol", "úkoly", "úkolů")} na začátek</span></div>
              </div>
            )}
          </div>
          {next && (
            <>
              <p className="hint" style={{ margin: "18px 4px 10px" }}>Příští výuka: {dayName(dowOf(next.date)).toLowerCase()} {fmtShort(next.date)}</p>
              <div className="card rows">
                {next.lessons.map((l, i) => {
                  const h = next.hours.get(l.hour);
                  const cancelled = l.change?.kind === "cancelled";
                  const home = !cancelled && isSelfStudy(l.room);
                  return (
                    <div key={i} className={`lesson-row${cancelled ? " cancelled" : ""}${home ? " selfstudy" : ""}`} style={{ ["--hue" as string]: `var(--h-${hues.get(l.subjectId) ?? "gray"})` }}>
                      <span className="bar" />
                      <div className="when"><b>{l.hour}. hodina</b>{h && <span>{hhmm(h.begin)}–{hhmm(h.end)}</span>}</div>
                      <div>
                        <div className="what">{l.subject}</div>
                        <div className="where">
                          {home && <span className="tag home">Samostudium</span>}
                          {!cancelled && (l.room || l.teacher) && <span>{[home ? "" : l.room, l.teacher].filter(Boolean).join(" · ")}</span>}
                          {l.change && <span className={`tag${cancelled ? " danger" : ""}`}>{l.change.label}</span>}
                        </div>
                        <LessonTags items={itemsForLesson(lessonItems, next.date, l, next.lessons)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
        ) : (
        <section>
          <div className="section-head">
            <h2 className="section">Dnešní rozvrh</h2>
            <Link href="/rozvrh" className="link-all">Vše →</Link>
          </div>
          {allDay && <div className="lesson allday" style={{ marginBottom: 12, padding: "12px 16px" }}><b>{allDay}</b></div>}
          {lessons.length ? (
            <div className="card rows">
              {lessons.map((l, i) => {
                const h = hours.get(l.hour);
                const isNow = !!h && l.change?.kind !== "cancelled" && now.minutes >= toMin(h.begin) && now.minutes < toMin(h.end);
                const isPast = !!h && now.minutes >= toMin(h.end);
                const cancelled = l.change?.kind === "cancelled";
                const home = !cancelled && isSelfStudy(l.room);
                return (
                  <Link key={i} href={`/rozvrh?open=${l.day}-${l.hour}-${lessons.filter((x) => x.hour === l.hour).indexOf(l)}`} className={`lesson-row${cancelled ? " cancelled" : ""}${home ? " selfstudy" : ""}${isNow ? " now" : ""}${isPast ? " past" : ""}`} title="Otevřít v rozvrhu" style={{ ["--hue" as string]: `var(--h-${hues.get(l.subjectId) ?? "gray"})` }}>
                    {h && <NowLine begin={toMin(h.begin)} end={toMin(h.end)} nextBegin={(() => { const nh = lessons.map((x) => hours.get(x.hour)).filter((x): x is NonNullable<typeof x> => !!x && toMin(x.begin) >= toMin(h.end)).sort((x, y) => toMin(x.begin) - toMin(y.begin))[0]; return nh ? toMin(nh.begin) : null; })()} />}
                    <span className="bar" />
                    <div className="when">
                      <b>{l.hour}. hodina</b>
                      {h && <span>{hhmm(h.begin)}–{hhmm(h.end)}</span>}
                    </div>
                    <div>
                      <div className="what">{l.subject}</div>
                      <div className="where">
                        {home && <span className="tag home">Samostudium</span>}
                        {!cancelled && (l.room || l.teacher) && <span>{[home ? "" : l.room, l.teacher].filter(Boolean).join(" · ")}</span>}
                        {l.change && <span className={`tag${cancelled ? " danger" : ""}`}>{l.change.label}</span>}
                      </div>
                      <LessonTags items={itemsForLesson(lessonItems, now.date, l, lessons)} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty">Rozvrh se nepodařilo načíst.</div>
          )}
        </section>
        );
  const testsEl = (
          <section>
            <div className="section-head">
              <h2 className="section">Nejbližší testy a zkoušení</h2>
              <Link href="/testy-a-zkouseni" className="link-all">Vše →</Link>
            </div>
            {tests.length ? (
              <div className="card rows">
                {tests.map((t) => (
                  <div key={t.id} className="item">
                    <div className="date-badge"><b>{Number(t.date.slice(8))}</b><span>{dayShort(((new Date(t.date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1)} · {monthShort(t.date)}</span></div>
                    <div className="item-main">
                      <div className="item-title">{t.subject_name}</div>
                      <div className="item-meta"><span className="chip">{t.oral ? "Zkoušení" : "Test"}</span>{t.makeup ? <span className="chip plain">Náhradní termín</span> : null}<span>{[`${fmtShort(t.date)} · ${relativeDay(t.date, now.date)}`, startAt(t.date, t.subject_name)].filter(Boolean).join(" · ")}</span></div>
                      {t.topic && <Clamp text={t.topic} lines={2} />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">{emptyTests()}</div>
            )}
          </section>
  );
  const tasksEl = (
          <section>
            <div className="section-head">
              <h2 className="section">Úkoly</h2>
              <Link href="/ukoly" className="link-all">Vše →</Link>
            </div>
            {tasks.length ? (
              <div className="card rows">
                {tasks.map((t) => {
                  const days = t.due_date ? diffDays(now.date, t.due_date) : null;
                  return (
                    <div key={t.id} className="item">
                      <TaskCheck id={t.id} done={false} />
                      <div className="item-main">
                        <div className="item-title">{t.title}</div>
                        <div className="item-meta">
                          {t.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${t.hue ?? "gray"})` }}>{t.subject_name}</span>}
                          {t.due_date && <span className={`due${days! < 0 ? " late" : days! <= 1 ? " soon" : ""}`}>{[relativeDay(t.due_date, now.date), startAt(t.due_date, t.subject_name)].filter(Boolean).join(" · ")}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty">{emptyTasks()}</div>
            )}
          </section>
  );
  const layout = parseLayout(getPref(user, "today_layout"));
  // doplňkové panely se sestavují jen tehdy, když je má uživatel zapnuté (nic navíc se nenačítá)
  const on = (id: string) => layout.find((x) => x.id === id)?.col !== "h";
  const bk = !!user.bakalari_refresh_enc;
  const box = (title: string, href: string | null, label: string, body: React.ReactNode) => (
    <section>
      <div className="section-head">
        <h2 className="section">{title}</h2>
        {href && <Link href={href} className="link-all">{label}</Link>}
      </div>
      {body}
    </section>
  );

  let tomorrowEl: React.ReactNode = null;
  if (on("y") || afterSchool) {
    const monday = now.dow >= 5; // v pátek a o víkendu je „další den“ pondělí
    const tt = monday ? (await getTimetable(user, "next")).data : result.data;
    const day = monday ? 1 : now.dow + 1;
    const dayDate = monday ? addDays(mondayOf(now.date), 7) : addDays(now.date, 1);
    const hrs = new Map((tt?.hours ?? []).map((h) => [h.hour, h]));
    const ls = (tt?.lessons ?? []).filter((l) => l.day === day).sort((a, b) => a.hour - b.hour);
    tomorrowEl = box(monday ? "Rozvrh na pondělí" : "Zítřejší rozvrh", "/rozvrh", "Vše →", ls.length ? (
      <div className="card rows">
        {ls.map((l, i) => {
          const h = hrs.get(l.hour);
          const cancelled = l.change?.kind === "cancelled";
          const home = !cancelled && isSelfStudy(l.room);
          return (
            <div key={i} className={`lesson-row${cancelled ? " cancelled" : ""}${home ? " selfstudy" : ""}`} style={{ ["--hue" as string]: `var(--h-${hues.get(l.subjectId) ?? "gray"})` }}>
              <span className="bar" />
              <div className="when"><b>{l.hour}. hodina</b>{h && <span>{hhmm(h.begin)}–{hhmm(h.end)}</span>}</div>
              <div>
                <div className="what">{l.subject}</div>
                <div className="where">
                  {home && <span className="tag home">Samostudium</span>}
                  {!cancelled && (l.room || l.teacher) && <span>{[home ? "" : l.room, l.teacher].filter(Boolean).join(" · ")}</span>}
                  {l.change && <span className={`tag${cancelled ? " danger" : ""}`}>{l.change.label}</span>}
                </div>
                <LessonTags items={itemsForLesson(lessonItems, dayDate, l, ls)} />
              </div>
            </div>
          );
        })}
      </div>
    ) : <div className="empty">{tt ? "Bez hodin." : "Rozvrh se nepodařilo načíst."}</div>);
  }

  let marksEl: React.ReactNode = null;
  if (on("z") && bk) {
    const list = ((await getMarks(user)).data?.subjects ?? []).flatMap((s) => s.marks).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    marksEl = box("Poslední známky", "/znamky", "Vše →", list.length ? (
      <div className="card rows">
        {list.map((m) => (
          <Link key={m.id} href="/znamky" className="item">
            <div className="date-badge"><b>{m.text}</b></div>
            <div className="item-main">
              <div className="item-title">{m.subject}</div>
              <div className="item-meta"><span>{[m.caption || m.theme, m.weight ? `váha ${m.weight}` : "", fmtShort(m.date)].filter(Boolean).join(" · ")}</span></div>
            </div>
          </Link>
        ))}
      </div>
    ) : <div className="empty">Zatím žádné známky.</div>);
  }

  let absenceEl: React.ReactNode = null;
  if (on("a") && bk) {
    const d = (await getAbsence(user)).data;
    if (d) {
      const own = Number(getPref(user, "abs_limit")) || 0;
      const limit = own || Math.round(d.threshold * 100);
      const hoursTotal = d.days.reduce((a, x) => a + absenceHours(x), 0);
      const named = namedAbsence(d.subjects);
      const lessons = named.reduce((a, s) => a + s.lessons, 0);
      const ratio = lessons ? named.reduce((a, s) => a + s.missed, 0) / lessons : 0;
      absenceEl = box("Absence", "/absence", "Vše →", (
        <div className="stats auto">
          <div className="card stat"><b>{hoursTotal}</b><span>zameškaných {plural(hoursTotal, "hodina", "hodiny", "hodin")}</span></div>
          <div className={`card stat${ratio * 100 >= limit ? " alert" : ""}`}><b>{Math.round(ratio * 1000) / 10} %</b><span>limit {limit} %</span></div>
        </div>
      ));
    }
  }

  let calEl: React.ReactNode = null;
  if (on("c")) {
    const { events } = await calendarEvents(user, now.date, addDays(now.date, 7), new Set(["test", "task", "change", "event", "other"]));
    const list = events.filter((e) => !e.done && !e.cancelled).slice(0, 6);
    calEl = box("Kalendář na týden", "/kalendar", "Vše →", list.length ? (
      <div className="card rows">
        {list.map((e, i) => (
          <Link key={`${e.kind}-${e.id ?? i}-${e.date}`} href={e.href} className="item">
            <div className="date-badge"><b>{Number(e.date.slice(8))}</b><span>{dayShort(dowOf(e.date))} · {monthShort(e.date)}</span></div>
            <div className="item-main">
              <div className="item-title">{e.title}</div>
              <div className="item-meta"><span>{[relativeDay(e.date, now.date), e.time, e.sub].filter(Boolean).join(" · ")}</span></div>
            </div>
          </Link>
        ))}
      </div>
    ) : <div className="empty">Na příštích sedm dní nic nemáš.</div>);
  }

  let notesEl: React.ReactNode = null;
  if (on("p")) {
    const list = all<{ id: number; title: string; subject_name: string | null; hue: string | null; updated_at: number }>(
      "SELECT n.id, n.title, s.name AS subject_name, s.hue, n.updated_at FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id WHERE n.user_id = ? AND n.deleted_at IS NULL ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 5",
      user.id,
    );
    notesEl = box("Poznámky", "/poznamky", "Vše →", list.length ? (
      <div className="card rows">
        {list.map((n) => (
          <Link key={n.id} href={`/poznamky/${n.id}`} className="item">
            <div className="item-main">
              <div className="item-title">{n.title || "Bez názvu"}</div>
              <div className="item-meta">
                {n.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${n.hue ?? "gray"})` }}>{n.subject_name}</span>}
                <span>{fmtDateTime(n.updated_at)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    ) : <div className="empty">Zatím žádné poznámky.</div>);
  }

  let messagesEl: React.ReactNode = null;
  if (on("u")) {
    const list = listMessages(user.id, undefined, 5);
    messagesEl = box("Zprávy", null, "", list.length ? (
      <div className="card rows">
        {list.map((m) => (
          <form key={m.id} action={openMessage}>
            <input type="hidden" name="id" value={m.id} />
            <button className="item item-btn">
              <div className="item-main">
                <div className="item-title" style={m.read_at ? undefined : { fontWeight: 800 }}>{m.title}</div>
                {m.body && <div className="item-meta"><span>{m.body}</span></div>}
              </div>
            </button>
          </form>
        ))}
      </div>
    ) : <div className="empty">Žádné zprávy.</div>);
  }

  let komensEl: React.ReactNode = null;
  if (on("q") && bk) {
    const list = ((await getKomens(user, "received")).data ?? []).filter((m) => !m.read).slice(0, 4);
    komensEl = box("Komens", "/komunikace", "Vše →", list.length ? (
      <div className="card rows">
        {list.map((m) => (
          <Link key={m.id} href={`/komunikace?t=komens&m=${encodeURIComponent(m.id)}`} className="item">
            <div className="item-main">
              <div className="item-title">{m.title}</div>
              <div className="item-meta"><span>{m.sender}</span></div>
            </div>
          </Link>
        ))}
      </div>
    ) : <div className="empty">Žádné nepřečtené zprávy.</div>);
  }

  let cashEl: React.ReactNode = null;
  if (on("m") && user.cash_enabled) {
    const list = myPayments(user).filter((p) => p.status === "unpaid").slice(0, 4);
    cashEl = box("Pokladna", "/pokladna", "Vše →", list.length ? (
      <div className="card rows">
        {list.map((p) => (
          <Link key={p.id} href="/pokladna" className="item">
            <div className="item-main">
              <div className="item-title">{p.title}</div>
              <div className="item-meta"><span>{kc(p.amount_cents)}{p.due_date ? ` · do ${fmtShort(p.due_date)}` : ""}</span></div>
            </div>
          </Link>
        ))}
      </div>
    ) : <div className="empty">Nic k zaplacení.</div>);
  }

  const quickEl = on("b") ? box("Rychlé akce", null, "", (
    <div className="card card-pad">
      <div className="btn-row" style={{ flexWrap: "wrap" }}>
        <Link href="/ukoly?new=1" className="btn">Nový úkol</Link>
        <Link href="/testy-a-zkouseni?new=1" className="btn">Nový test nebo zkoušení</Link>
        <form action={createNote}><button className="btn">Nová poznámka</button></form>
        <Link href="/rozvrh?t=pristi" className="btn">Rozvrh na příští týden</Link>
        <Link href="/kalendar" className="btn">Kalendář</Link>
      </div>
    </div>
  )) : null;

  const signPref = getPref(user, "horoscope") ?? "";
  const sign = isSign(signPref) ? signPref : "";
  const hs = sign ? dailyHoroscope(sign, now.date) : null;
  const horoscopeEl = on("x") ? box("Denní horoskop", null, "", (
    <div className="card card-pad stack">
      <SignPicker sign={sign} />
      {hs && sign ? (
        <>
          <p style={{ margin: 0 }}><b>{SIGNS.find((s) => s.id === sign)?.label}:</b> {hs.general}</p>
          <p style={{ margin: 0 }}><b>Škola:</b> {hs.school}</p>
          <p className="hint" style={{ margin: 0 }}>Šťastné číslo {hs.number} · barva dne {hs.color} · jen pro zábavu</p>
        </>
      ) : <p className="hint" style={{ margin: 0 }}>Vyber znamení a každý den tu najdeš nový horoskop. Je to jen pro zábavu.</p>}
    </div>
  )) : null;

  const widgets: Record<string, React.ReactNode> = { x: horoscopeEl, s: afterSchool && tomorrowEl ? tomorrowEl : scheduleEl, o: lunchBox || null, d: user.duty_enabled ? <DutyWidget user={user} /> : null, t: testsEl, k: tasksEl, y: afterSchool ? null : tomorrowEl, z: marksEl, a: absenceEl, c: calEl, p: notesEl, u: messagesEl, q: komensEl, m: cashEl, b: quickEl };
  const available = ["r", "s", ...(lunch ? ["o"] : []), ...(user.duty_enabled ? ["d"] : []), "t", "k", "y", ...(bk ? ["z", "a", "q"] : []), "c", "p", "u", ...(user.cash_enabled ? ["m"] : []), "b", "x"];
  const col = (c: "l" | "r") => layout.filter((x) => x.col === c && widgets[x.id]).map((x) => <Fragment key={x.id}>{widgets[x.id]}</Fragment>);
  const showRuler = layout.find((x) => x.id === "r")?.col !== "h";
  const hasRight = layout.some((x) => x.col === "r" && widgets[x.id]);
  const hasLeft = layout.some((x) => x.col === "l" && widgets[x.id]);

  return (
    <div className="wide">
      <p className="eyebrow">{fmtFull(now.date)}{dayNames.length > 0 && (
          <span className="nameday"> · svátek {dayNames.length > 1 ? "mají" : "má"}{" "}
            {dayNames.map((n, i) => {
              const who = mates.filter((m) => celebrates(m.name, [n])).map((m) => m.name);
              return (
                <Fragment key={n}>
                  {i > 0 && " a "}
                  {who.length ? <b className="nd-today" title={`Ve třídě: ${who.join(", ")}`}>{n}</b> : n}
                </Fragment>
              );
            })}
          </span>
        )}</p>
      <h1 className="title hero">
        {greeting(now.hour, user.id, now.dow, now.date)},{" "}
        <span className="scribble">
          {vocative(user.name.split(" ")[0])}
          <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden>
            <path pathLength={1} d="M2 9 C 28 2, 58 13, 92 6 S 152 3, 198 8" />
          </svg>
        </span>
      </h1>
      {showRuler && <DayLine slots={slots} />}
      {showRuler && <DayRuler slots={slots} />}
      <div className="today-tools"><TodayCustomize initial={layout} available={available} /></div>
      <SyncNotice result={result} />
      <div className="grid-2" style={hasLeft && hasRight ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
        {hasLeft && <div className="stack-lg">
          {col("l")}
        </div>}

        {hasRight && <div className="stack-lg">
          {col("r")}
        </div>}
      </div>
    </div>
  );
}
