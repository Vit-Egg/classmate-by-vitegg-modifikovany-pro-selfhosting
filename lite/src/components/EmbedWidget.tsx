import type { RenderInput } from "@/lib/embed/types";

/**
 * Widget ve vzhledu Classmate (stejné třídy a barvy jako nástěnka Dnes). Stejný soubor je v plné i odlehčené verzi.
 * Uvnitř Classmate (`in-cm`) se schová nadpis, protože ho Classmate kreslí nad widgetem sám.
 */
const DAYS = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];
const dowIdx = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const short = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
export function dayLabel(iso: string, today?: string) {
  if (today && iso === today) return `Dnes · ${short(iso)}`;
  const d = DAYS[dowIdx(iso)];
  return `${d[0].toUpperCase()}${d.slice(1)} ${short(iso)}`;
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="cmw-empty">{children}</div>;
const hue = (h?: string) => ({ ["--hue" as string]: `var(--h-${h ?? "gray"})` });

export function EmbedWidget({ data, title }: { data: RenderInput; title: string }) {
  return (
    <div className="cmw">
      <h2 className="section cmw-title">{title}</h2>
      <div className="card cmw-card">{body(data)}</div>
    </div>
  );
}

function body(d: RenderInput) {
  switch (d.id) {
    case "rozvrh": {
      const days = d.days.filter((x) => x.lessons.length || x.note).slice(0, 2);
      if (!days.length) return <Empty>Rozvrh zatím není načtený.</Empty>;
      return days.map((day) => (
        <div key={day.date} className="cmw-day">
          <div className="cmw-dayname">{dayLabel(day.date, d.today)}{day.note && <span className="cmw-mut"> · {day.note}</span>}</div>
          {day.lessons.map((l) => (
            <div key={l.hour} className={`cmw-row cmw-lesson${l.cancelled ? " is-off" : ""}`} style={hue(l.hue)}>
              <span className="cmw-num">{l.hour}</span>
              <span className="cmw-main">
                <b>{l.subject || "—"}</b>
                <small>{[l.begin && `${l.begin}–${l.end}`, l.room, l.teacher].filter(Boolean).join(" · ")}</small>
              </span>
              {l.change && <span className={`tag${l.cancelled ? " danger" : ""}`}>{l.change}</span>}
            </div>
          ))}
        </div>
      ));
    }
    case "suplovani": {
      const rows = d.days.flatMap((day) => day.lessons.filter((l) => l.change || l.cancelled).map((l) => ({ day, l })));
      if (!rows.length) return <Empty>Žádné změny v rozvrhu.</Empty>;
      return rows.slice(0, 12).map(({ day, l }) => (
        <div key={`${day.date}-${l.hour}`} className={`cmw-row${l.cancelled ? " is-off" : ""}`} style={hue(l.hue)}>
          <span className="cmw-num">{l.hour}</span>
          <span className="cmw-main"><b>{l.subject || "—"}</b><small>{dayLabel(day.date, d.today)}</small></span>
          <span className={`tag${l.cancelled ? " danger" : ""}`}>{l.change ?? "odpadá"}</span>
        </div>
      ));
    }
    case "znamky":
      if (!d.marks.length) return <Empty>Zatím žádné známky.</Empty>;
      return d.marks.slice(0, 10).map((m, i) => (
        <div key={i} className="cmw-row">
          <span className={`cmw-mark${m.isNew ? " is-new" : ""}`}>{m.value}</span>
          <span className="cmw-main"><b>{m.subject}</b><small>{[m.caption, m.weight ? `váha ${m.weight}` : "", short(m.date)].filter(Boolean).join(" · ")}</small></span>
          {m.isNew && <span className="tag accent">nová</span>}
        </div>
      ));
    case "prumery":
      if (!d.averages.length) return <Empty>Zatím žádné průměry.</Empty>;
      return d.averages.map((a) => (
        <div key={a.subject} className="cmw-row">
          <span className="cmw-main"><b>{a.subject}</b><small>{a.marks} {a.marks === 1 ? "známka" : a.marks < 5 ? "známky" : "známek"}</small></span>
          <span className={`cmw-avg${Number(a.average.replace(",", ".")) >= 3.5 ? " is-bad" : ""}`}>{a.average || "–"}</span>
        </div>
      ));
    case "absence": {
      const a = d.absence;
      if (!a) return <Empty>Absence zatím není načtená.</Empty>;
      const top = a.subjects.filter((s) => s.lessons > 0 && s.missed > 0).map((s) => ({ ...s, p: s.missed / s.lessons })).sort((x, y) => y.p - x.p).slice(0, 5);
      return (
        <>
          <div className="cmw-stats">
            <div><b>{a.total}</b><small>celkem hodin</small></div>
            <div><b>{a.excused}</b><small>omluveno</small></div>
            <div><b>{a.unsolved}</b><small>nevyřízeno</small></div>
            <div><b className={a.missed ? "is-bad" : undefined}>{a.missed}</b><small>neomluveno</small></div>
          </div>
          {top.map((s) => (
            <div key={s.name} className="cmw-row">
              <span className="cmw-main">
                <b>{s.name}</b>
                <span className="cmw-bar"><i style={{ width: `${Math.min(100, Math.round((s.p / Math.max(a.threshold, 0.01)) * 100))}%` }} className={s.p >= a.threshold ? "is-bad" : undefined} /></span>
              </span>
              <span className={`cmw-pct${s.p >= a.threshold ? " is-bad" : ""}`}>{Math.round(s.p * 100)} %</span>
            </div>
          ))}
        </>
      );
    }
    case "komens":
      if (!d.messages.length) return <Empty>Žádné zprávy.</Empty>;
      return d.messages.slice(0, 8).map((m, i) => (
        <div key={i} className={`cmw-row${m.read ? "" : " is-unread"}`}>
          <span className="cmw-main"><b>{m.title || "(bez předmětu)"}</b><small>{m.sender} · {short(m.date.slice(0, 10))}</small></span>
          {!m.read && <span className="tag accent">nové</span>}
        </div>
      ));
    case "obedy":
      if (d.lunch == null) return <Empty>Strava.cz není propojená.</Empty>;
      if (!d.lunch.length) return <Empty>Na příští dny není jídelníček.</Empty>;
      return d.lunch.slice(0, 3).map((day) => (
        <div key={day.date} className="cmw-day">
          <div className="cmw-dayname">{dayLabel(day.date, d.today)}</div>
          {day.meals.map((m, i) => (
            <div key={i} className={`cmw-row${m.ordered ? " is-ordered" : ""}`}>
              <span className="cmw-main"><small>{m.kind}</small><span>{m.name}</span></span>
              {m.ordered && <span className="tag accent">objednáno</span>}
            </div>
          ))}
        </div>
      ));
    case "ukoly":
      if (!d.tasks.length) return <Empty>Žádné otevřené úkoly.</Empty>;
      return d.tasks.slice(0, 10).map((t, i) => (
        <div key={i} className="cmw-row cmw-lesson" style={hue(t.hue)}>
          <span className="cmw-main"><b>{t.title}</b><small>{[t.subject, t.due ? `do ${dayLabel(t.due, d.today).toLowerCase()}` : ""].filter(Boolean).join(" · ")}</small></span>
        </div>
      ));
    case "testy":
      if (!d.tests.length) return <Empty>Žádné testy v příštích 30 dnech.</Empty>;
      return d.tests.slice(0, 10).map((t, i) => (
        <div key={i} className="cmw-row cmw-lesson" style={hue(t.hue)}>
          <span className="cmw-main"><b>{t.subject}{t.topic ? ` · ${t.topic}` : ""}</b><small>{dayLabel(t.date, d.today)}</small></span>
        </div>
      ));
  }
}
