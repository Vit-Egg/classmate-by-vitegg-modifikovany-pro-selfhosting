import { isSelfStudy } from "@/lib/selfstudy";
import { dayName, fmtShort, addDays, hhmm } from "@/lib/dates";
import { TimetableFx, type LessonDetail } from "./TimetableFx";
import { ITEM_LABEL, type LessonItem, type LessonItems } from "@/lib/lessonitems";
import { MobileDays } from "./MobileDays";
import type { Lesson, Timetable as TT } from "@/lib/types";

type SubjectHue = Map<string, string>;

export type { LessonItem, LessonItems };

/**
 * Ve stálém rozvrhu: hodina, která je v obou týdnech (sudém i lichém), platí vždy – bez štítku týdne.
 * Bakaláři ji vrací buď jako jednu hodinu s oběma cykly, nebo jako dvě shodné hodiny po jednom cyklu.
 */
export function mergeCycles(lessons: Lesson[]): Lesson[] {
  const all = new Set(lessons.flatMap((l) => l.cycles));
  if (all.size < 2) return lessons;
  const out: Lesson[] = [];
  const seen = new Map<string, Lesson>();
  for (const l of lessons) {
    const key = [l.day, l.hour, l.subjectId, l.room, l.teacher, [...l.groups].sort().join(",")].join("|");
    const prev = seen.get(key);
    if (prev) {
      prev.cycles = [...new Set([...prev.cycles, ...l.cycles])];
      continue;
    }
    const copy = { ...l, cycles: [...l.cycles] };
    seen.set(key, copy);
    out.push(copy);
  }
  return out.map((l) => (l.cycles.length >= all.size ? { ...l, cycles: [] } : l));
}

function LessonCard({ l, hue, dkey, permanent, items }: { l: Lesson; hue: string; dkey: string; permanent: boolean; items?: LessonItem[] }) {
  const cancelled = l.change?.kind === "cancelled";
  const home = !cancelled && isSelfStudy(l.room);
  const meta = [!cancelled && (home ? "Samostudium" : l.room), !cancelled && l.teacher].filter(Boolean).join(" · ");
  const extra = [l.change?.label, permanent && l.cycles.length ? l.cycles.join(", ") : ""].filter(Boolean).join(" · ");
  return (
    <div
      className={`lesson${cancelled ? " cancelled" : ""}${home ? " selfstudy" : ""}`}
      data-day={l.day}
      data-hour={l.hour}
      data-k={dkey}
      data-subject={l.subjectId || undefined}
      tabIndex={0}
      role="button"
      style={{ ["--hue" as string]: `var(--h-${hue})` }}
      title={[l.subject, home ? "Samostudium, můžeš být doma" : "", meta, extra].filter(Boolean).join(" — ")}
    >
      <b>{l.subject}</b>
      {(meta || extra) && (
        <div className="meta">
          {meta && <span className="rt">{meta}</span>}
          {extra && <span className={`tag${cancelled ? " danger" : ""}`}>{extra}</span>}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="lesson-items">
          {items.map((it, i) => <span key={i} className={`li li-${it.kind}`} title={`${ITEM_LABEL[it.kind]}: ${it.text}`}>{ITEM_LABEL[it.kind]}</span>)}
        </div>
      )}
    </div>
  );
}

export function TimetableView({ tt, monday, today, todayDow, vertical, hues, permanent, openKey, items }: { items?: LessonItems; tt: TT; monday?: string; today: string; todayDow: number; vertical: boolean; hues: SubjectHue; permanent: boolean; /** hodina, která se hned po načtení rozklikne (den-hodina-pořadí) */ openKey?: string }) {
  const days = [1, 2, 3, 4, 5];
  const lessonsAll = permanent ? mergeCycles(tt.lessons) : tt.lessons;
  const maxHour = Math.max(0, ...lessonsAll.map((l) => l.hour));
  const hours = tt.hours.filter((h) => h.hour >= 1 && h.hour <= Math.max(maxHour, 1)).sort((a, b) => a.hour - b.hour);
  const dayDate = (d: number) => (monday ? addDays(monday, d - 1) : undefined);
  // celodenní události (ředitelské volno, exkurze…) patří ke konkrétnímu týdnu, do stálého rozvrhu nepatří
  const allDay = new Map(permanent ? [] : tt.days.filter((d) => d.description).map((d) => [d.day, d.description!]));
  const hasAllDay = allDay.size > 0;
  const cell = (d: number, h: number) => lessonsAll.filter((l) => l.day === d && l.hour === h);
  const hourOf = new Map(hours.map((h) => [h.hour, h]));
  const hourIdx = new Map(hours.map((h, i) => [h.hour, i]));
  const rowsCount = Math.max(hours.length, 1);
  /** Pevné umístění v mřížce, ať jde sloučit celý den do jedné buňky, aniž by se rozjely ostatní. */
  const place = (d: number, idx: number) => (vertical ? { gridRow: d + 1, gridColumn: idx + 2 } : { gridRow: idx + 2, gridColumn: d + 1 });
  /** položky patří jen k první (neodpadlé) hodině předmětu daného dne, ať se u dvouhodinovek neopakují */
  const firstOf = new Map<string, Lesson>();
  for (const l of [...lessonsAll].sort((a, b) => a.hour - b.hour)) {
    const k = `${l.day}|${l.subject}`;
    if (l.change?.kind !== "cancelled" && !firstOf.has(k)) firstOf.set(k, l);
  }
  const itemsOf = (l: Lesson): LessonItem[] | undefined => {
    if (permanent || !monday || !items || firstOf.get(`${l.day}|${l.subject}`) !== l) return undefined;
    return items.get(`${dayDate(l.day)}|${l.subject}`);
  };
  const details: Record<string, LessonDetail> = {};
  const addDetail = (l: Lesson, key: string) => {
    const h = hourOf.get(l.hour);
    const date = dayDate(l.day);
    details[key] = {
      subject: l.subject,
      when: [`${dayName(l.day)}${date ? " " + fmtShort(date) : ""}`, `${l.hour}. hodina`, h ? `${hhmm(h.begin)}–${hhmm(h.end)}` : ""].filter(Boolean).join(" · "),
      theme: permanent ? undefined : l.theme,
      items: itemsOf(l),
      selfStudy: l.change?.kind !== "cancelled" && isSelfStudy(l.room),
      room: l.change?.kind === "cancelled" || isSelfStudy(l.room) ? undefined : l.roomName && l.roomName !== l.room ? `${l.room} (${l.roomName})` : l.room || undefined,
      teacher: l.change?.kind === "cancelled" ? undefined : l.teacherName || l.teacher || undefined,
      groups: l.groupLabels?.length ? l.groupLabels.join(", ") : undefined,
      cycle: permanent && l.cycles.length ? l.cycles.join(", ") : undefined,
      change: l.change ? { label: l.change.label, text: l.change.text, cancelled: l.change.kind === "cancelled" } : undefined,
      hue: hues.get(l.subjectId) ?? "gray",
    };
  };

  const renderCell = (d: number, h: number) => {
    const list = cell(d, h);
    return (
      <div className="tt-cell" key={`${d}-${h}`} data-day={d} data-hour={h} style={place(d, hourIdx.get(h) ?? 0)}>
        {list.length
          ? list.map((l, i) => {
              const k = `${d}-${h}-${i}`;
              addDetail(l, k);
              return <LessonCard key={i} l={l} hue={hues.get(l.subjectId) ?? "gray"} dkey={k} permanent={permanent} items={itemsOf(l)} />;
            })
          : <div className="cell-empty" />}
      </div>
    );
  };
  const dayHead = (d: number) => {
    const date = dayDate(d);
    const isToday = monday ? date === today : d === todayDow;
    return (
      <div key={`h${d}`} className={`tt-head${isToday ? " today" : ""}`} style={vertical ? { gridRow: d + 1, gridColumn: 1, textAlign: "left", paddingLeft: 14 } : { gridRow: 1, gridColumn: d + 1 }}>
        {dayName(d)}
        {date && <small>{fmtShort(date)}</small>}
      </div>
    );
  };
  const hourSide = (h: (typeof hours)[number]) => (
    <div className="tt-side" key={`s${h.hour}`} style={{ gridRow: (hourIdx.get(h.hour) ?? 0) + 2, gridColumn: 1 }}>
      <span>{hhmm(h.begin)}</span>
      <b>{h.hour}</b>
      <span>{hhmm(h.end)}</span>
    </div>
  );

  // celodenní událost: všechny hodiny dne se spojí do jedné buňky a rozvrh se kvůli ní neprodlužuje
  const allDayKey = (d: number) => `${d}-allday`;
  const addAllDayDetail = (d: number) => {
    const date = dayDate(d);
    const dayLessons = lessonsAll.filter((l) => l.day === d).sort((a, b) => a.hour - b.hour);
    details[allDayKey(d)] = {
      subject: allDay.get(d)!,
      when: [`${dayName(d)}${date ? " " + fmtShort(date) : ""}`, "celý den"].join(" · "),
      hue: "blue",
      allDay: true,
      lessons: dayLessons.length ? dayLessons.map((l) => `${l.hour}. ${l.change?.kind === "cancelled" ? "odpadá" : l.subject}`) : undefined,
    };
  };
  const mergedCell = (d: number) => {
    addAllDayDetail(d);
    const style = vertical ? { gridRow: d + 1, gridColumn: `2 / span ${rowsCount}` } : { gridRow: `2 / span ${rowsCount}`, gridColumn: d + 1 };
    return (
      <div className="tt-cell" key={`ad${d}`} style={style}>
        <div className="lesson allday merged" data-k={allDayKey(d)} tabIndex={0} role="button" title={allDay.get(d)}>
          <b>{allDay.get(d)}</b>
          <span className="meta">Celý den</span>
        </div>
      </div>
    );
  };

  if (!lessonsAll.length && !hasAllDay) return <div className="empty">V tomhle rozvrhu zatím nic není.</div>;

  const toMin = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  const fxHours = hours.map((h) => ({ hour: h.hour, begin: toMin(h.begin), end: toMin(h.end) }));
  const live = monday ? monday === addDays(today, 1 - todayDow) : true;

  // telefon: seznam hodin vybraného dne (jen od první do poslední hodiny, mezery jako „volno“)
  const todayIdx = monday ? days.findIndex((d) => dayDate(d) === today) : days.indexOf(todayDow);
  const mobilePanels = days.map((d) => {
    const hrs = hours.filter((h) => cell(d, h.hour).length);
    const first = hrs[0]?.hour ?? 0;
    const lastH = hrs[hrs.length - 1]?.hour ?? -1;
    return (
      <div key={d} style={{ display: "contents" }}>
        {allDay.has(d) && (() => (addAllDayDetail(d), <div className="lesson allday merged" data-k={allDayKey(d)} tabIndex={0} role="button"><b>{allDay.get(d)}</b><span className="meta">Celý den</span></div>))()}
        {hrs.length === 0 && !allDay.has(d) && <div className="empty">V tento den nic není.</div>}
        {!allDay.has(d) && hours.filter((h) => h.hour >= first && h.hour <= lastH).map((h) => {
          const list = cell(d, h.hour);
          return (
            <div className="mday-row" key={h.hour} data-day={d} data-hour={h.hour}>
              <div className="mday-time"><span>{hhmm(h.begin)}</span><b>{h.hour}</b><span>{hhmm(h.end)}</span></div>
              <div className="mday-cell">
                {list.length ? list.map((l, i) => {
                  const k = `${d}-${h.hour}-${i}`;
                  return <LessonCard key={i} l={l} hue={hues.get(l.subjectId) ?? "gray"} dkey={k} permanent={permanent} items={itemsOf(l)} />;
                }) : <div className="mday-free">volno</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  });

  return (
    <TimetableFx hours={fxHours} live={live} details={details} openKey={openKey}>
    <MobileDays
      initial={openKey && days.includes(Number(openKey[0])) ? Number(openKey[0]) - 1 : todayIdx >= 0 ? todayIdx : 0}
      tabs={days.map((d) => ({ label: dayName(d).slice(0, 2), sub: dayDate(d) ? fmtShort(dayDate(d)!) : undefined, today: monday ? dayDate(d) === today : d === todayDow }))}
      panels={mobilePanels}
    />
    <div className="tt-wrap tt-desktop">
      {vertical ? (
        <div className="tt v" style={{ gridTemplateColumns: `90px repeat(${rowsCount}, minmax(84px, 1fr))`, minWidth: 90 + rowsCount * 86 }}>
          <div style={{ gridRow: 1, gridColumn: 1 }} />
          {hours.map((h, i) => (
            <div key={h.hour} className="tt-head" style={{ padding: "8px 0", gridRow: 1, gridColumn: i + 2 }}>
              {h.hour}
              <small>
                {hhmm(h.begin)}–{hhmm(h.end)}
              </small>
            </div>
          ))}
          {days.map((d) => (
            <div key={`row${d}`} style={{ display: "contents" }}>
              {dayHead(d)}
              {allDay.has(d) ? mergedCell(d) : hours.map((h) => renderCell(d, h.hour))}
            </div>
          ))}
        </div>
      ) : (
        <div className="tt" style={{ gridTemplateColumns: "56px repeat(5, minmax(0, 1fr))" }}>
          <div style={{ gridRow: 1, gridColumn: 1 }} />
          {days.map(dayHead)}
          {hours.map((h) => hourSide(h))}
          {days.map((d) => (allDay.has(d) ? mergedCell(d) : hours.map((h) => renderCell(d, h.hour))))}
        </div>
      )}
    </div>
    </TimetableFx>
  );
}

/** Podoba rozvrhu pro sdílení a tisk mimo stránku (obrázek, text): žádné HTML, jen údaje. */
export type ShareModel = {
  title: string;
  days: { label: string; sub?: string; allDay?: string }[];
  hours: { hour: number; begin: string; end: string }[];
  /** cells[den][hodina] = hodiny, které v tu dobu jsou (víc jich je při dělených skupinách) */
  cells: { text: string; meta: string; hue: string; cancelled: boolean }[][][];
};

export function shareModel(tt: TT, { title, monday, permanent, hues }: { title: string; monday?: string; permanent: boolean; hues: SubjectHue }): ShareModel {
  const days = [1, 2, 3, 4, 5];
  const lessons = permanent ? mergeCycles(tt.lessons) : tt.lessons;
  const maxHour = Math.max(0, ...lessons.map((l) => l.hour));
  const hours = tt.hours.filter((h) => h.hour >= 1 && h.hour <= Math.max(maxHour, 1)).sort((a, b) => a.hour - b.hour);
  const allDay = new Map(permanent ? [] : tt.days.filter((d) => d.description).map((d) => [d.day, d.description!]));
  return {
    title,
    days: days.map((d) => ({ label: dayName(d), sub: monday ? fmtShort(addDays(monday, d - 1)) : undefined, allDay: allDay.get(d) })),
    hours: hours.map((h) => ({ hour: h.hour, begin: hhmm(h.begin), end: hhmm(h.end) })),
    cells: days.map((d) =>
      hours.map((h) =>
        lessons
          .filter((l) => l.day === d && l.hour === h.hour)
          .map((l) => {
            const cancelled = l.change?.kind === "cancelled";
            const home = !cancelled && isSelfStudy(l.room);
            const meta = [!cancelled && (home ? "Samostudium" : l.room), !cancelled && l.teacher, l.change?.label, permanent && l.cycles.length ? l.cycles.join(", ") : ""].filter(Boolean).join(" · ");
            return { text: l.subject, meta, hue: hues.get(l.subjectId) ?? "gray", cancelled };
          }),
      ),
    ),
  };
}
