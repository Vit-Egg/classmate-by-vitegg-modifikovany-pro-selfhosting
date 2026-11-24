import Link from "next/link";
import { cookies } from "next/headers";
import { PersistedSeg } from "@/components/PersistedSeg";
import { SyncNotice } from "@/components/SyncNotice";
import { TimetableView, shareModel, type LessonItems } from "@/components/Timetable";
import { TimetableShare } from "@/components/TimetableShare";
import { subjectHues } from "@/lib/content";
import { lessonItemsBetween } from "@/lib/lessonitems-data";
import { WeekPicker } from "@/components/WeekPicker";
import { addDays, fmtShort, mondayOf, pragueNow } from "@/lib/dates";
import { getPref } from "@/lib/prefs";
import type { Timetable } from "@/lib/types";
import { requireUser } from "@/lib/session";
import { getTimetable, getTimetableWeek, weekMonday, type TimetableKind } from "@/lib/sync";

export const metadata = { title: "Rozvrh" };
export const dynamic = "force-dynamic";

const tabs: { key: TimetableKind; param: string; label: string }[] = [
  { key: "this", param: "tento", label: "Tento týden" },
  { key: "next", param: "pristi", label: "Příští týden" },
  { key: "permanent", param: "staly", label: "Stálý rozvrh" },
];

function weekIsOver(tt: Timetable, now: ReturnType<typeof pragueNow>) {
  const days = tt.lessons.filter((l) => l.change?.kind !== "cancelled" && l.subjectId).map((l) => l.day);
  if (!days.length) return false;
  const last = Math.max(...days);
  if (now.dow > last) return true;
  if (now.dow < last) return false;
  const end = Math.max(...tt.lessons.filter((l) => l.day === last && l.change?.kind !== "cancelled" && l.subjectId).map((l) => tt.hours.find((h) => h.hour === l.hour)?.end ?? "0:00").map((e) => Number(e.split(":")[0]) * 60 + Number(e.split(":")[1])));
  return now.minutes >= end;
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ t?: string; o?: string; open?: string; d?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = pragueNow();
  // přesný týden z kalendáře (?d=datum libovolného dne týdne), jen v rozumném okolí dneška
  const min = addDays(now.date, -365);
  const max = addDays(now.date, 365);
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") && sp.d! >= min && sp.d! <= max ? mondayOf(sp.d!) : null;
  let tab = tabs.find((t) => t.param === sp.t) ?? tabs[0];
  let result = picked ? await getTimetableWeek(user, picked) : await getTimetable(user, tab.key);
  // Bez výslovné volby záložky se po konci posledního vyučování tento týden rovnou ukáže příští.
  if (!picked && !sp.t && result.data && weekIsOver(result.data, now)) {
    tab = tabs[1];
    result = await getTimetable(user, tab.key);
  }
  const orientation = sp.o === "v" || sp.o === "h" ? sp.o : (getPref(user, "tt_view") ?? (await cookies()).get("tt_view")?.value) === "v" ? "v" : "h";
  const vertical = orientation === "v";
  const href = (t: string) => `/rozvrh?t=${t}`;
  const weekStart = picked ?? (tab.key === "permanent" ? undefined : weekMonday(tab.key));
  const heading = picked ? `Rozvrh ${user.class_name} · týden ${fmtShort(picked)} – ${fmtShort(addDays(picked, 4))}` : tab.key === "permanent" ? `Stálý rozvrh ${user.class_name}` : `Rozvrh ${user.class_name} · ${tab.label.toLowerCase()} (${fmtShort(weekStart!)} – ${fmtShort(addDays(weekStart!, 4))})`;
  const share = result.data ? shareModel(result.data, { title: heading, monday: weekStart, permanent: !picked && tab.key === "permanent", hues: subjectHues(user.class_id) }) : null;

  // testy, zkoušení a úkoly toho týdne se ukážou u hodin příslušného předmětu
  const mon = weekStart && !(!picked && tab.key === "permanent") ? weekStart : null;
  const items: LessonItems = mon ? lessonItemsBetween(user, mon, addDays(mon, 4)) : new Map();

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Rozvrh</h1>
          <p className="subtitle">{picked ? `Týden ${fmtShort(picked)} – ${fmtShort(addDays(picked, 4))}` : tab.key === "permanent" ? "Základní rozvrh bez změn a suplování." : "Aktuální rozvrh z Bakalářů včetně změn"}</p>
        </div>
        {share && <TimetableShare model={share} file={`rozvrh-${weekStart ?? "staly"}`} />}
      </div>
      <div className="toolbar">
        <nav className="seg" aria-label="Období">
          {tabs.map((t) => (
            <Link key={t.key} href={href(t.param)} aria-current={!picked && t.key === tab.key}>{t.label}</Link>
          ))}
        </nav>
        <WeekPicker monday={picked ?? (tab.key === "permanent" ? mondayOf(now.date) : weekMonday(tab.key))} active={!!picked} min={min} max={max} />
        <div className="hide-mobile">
          <PersistedSeg param="o" cookie="tt_view" pref="tt_view" label="Zobrazení" current={orientation} options={[{ value: "h", label: "Horizontálně" }, { value: "v", label: "Vertikálně" }]} />
        </div>
      </div>
      <SyncNotice result={result} />
      {result.data && (
        <div className="tt-print-area">
        <p className="print-only">{heading}</p>
        <TimetableView
          tt={result.data}
          monday={picked ?? (tab.key === "permanent" ? undefined : weekMonday(tab.key))}
          today={now.date}
          todayDow={now.dow}
          vertical={vertical}
          hues={subjectHues(user.class_id)}
          permanent={!picked && tab.key === "permanent"}
          items={items}
          openKey={/^\d-\d{1,2}-\d$/.test(sp.open ?? "") ? sp.open : undefined}
        />
        </div>
      )}
    </div>
  );
}
