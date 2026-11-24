import Link from "next/link";
import { cookies } from "next/headers";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { CalendarView } from "@/components/CalendarView";
import { LayerToggles } from "@/components/LayerToggles";
import { PersistedSeg } from "@/components/PersistedSeg";
import { SyncNotice } from "@/components/SyncNotice";
import { ALL_KINDS, KINDS, calendarEvents, type CalKind } from "@/lib/calendar";
import { addDays, dowOf, mondayOf, pragueNow } from "@/lib/dates";
import { FEED_KINDS, feedKinds, feedLastUsed, feedToken } from "@/lib/calendar-feed";
import { getPref } from "@/lib/prefs";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Kalendář" };
export const dynamic = "force-dynamic";

const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

function parseKinds(l: string | undefined, hidden: string | undefined): CalKind[] {
  if (l === "-") return [];
  if (l) return l.split(",").filter((k): k is CalKind => (ALL_KINDS as string[]).includes(k));
  const off = (hidden ?? "").split(",");
  return ALL_KINDS.filter((k) => !off.includes(k));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; v?: string; l?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const jar = await cookies();
  const today = pragueNow().date;
  const view = (sp.v === "a" || sp.v === "m" ? sp.v : (getPref(user, "cal_view") ?? jar.get("cal_view")?.value) === "a" ? "a" : "m") as "m" | "a";
  const active = parseKinds(sp.l, getPref(user, "cal_hide") ?? jar.get("cal_hide")?.value);

  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  const gridFrom = mondayOf(first);
  const gridTo = addDays(mondayOf(last), 6);
  const weeks = (Date.parse(gridTo) - Date.parse(gridFrom)) / 86_400_000 / 7 + 1 / 7;
  const weekCount = Math.round(weeks);

  const from = view === "m" ? gridFrom : today;
  const to = view === "m" ? gridTo : addDays(today, 59);
  const { events, partial } = await calendarEvents(user, from, to, new Set(active));

  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  void dowOf;
  const token = feedToken(user.id);
  const feedPath = token ? `/kalendar-feed/${token}` : null;

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Kalendář</h1>
          <p className="subtitle">Testy a zkoušení, úkoly, změny v rozvrhu, svátky a další termíny na jednom místě</p>
        </div>
        <div className="head-actions">
          <CalendarSubscribe path={feedPath} lastUsed={feedLastUsed(user.id)} kinds={FEED_KINDS} active={feedKinds(user.id)} />
        </div>
      </div>

      <div className="toolbar">
        {view === "m" ? (
          <div className="cal-nav">
            <Link className="btn small" href={`/kalendar?m=${shift(-1)}`} aria-label="Předchozí měsíc">←</Link>
            <b className="cal-month">{MONTHS[mo - 1]} {y}</b>
            <Link className="btn small" href={`/kalendar?m=${shift(1)}`} aria-label="Další měsíc">→</Link>
            {month !== today.slice(0, 7) && <Link className="btn small" href="/kalendar">Dnes</Link>}
          </div>
        ) : (
          <b className="cal-month">Příštích 60 dní</b>
        )}
        <PersistedSeg param="v" cookie="cal_view" pref="cal_view" label="Zobrazení" current={view} options={[{ value: "m", label: "Měsíc" }, { value: "a", label: "Seznam" }]} />
      </div>
      <LayerToggles kinds={KINDS} active={active} />
      <div style={{ height: 18 }} />
      {partial && <SyncNotice result={{ data: null, stale: true, error: "network" }} />}
      <CalendarView events={events} view={view} gridFrom={gridFrom} weeks={weekCount} month={month} today={today} />
    </div>
  );
}
