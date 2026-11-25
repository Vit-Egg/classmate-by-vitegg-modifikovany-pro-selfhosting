import Link from "next/link";
import { cookies } from "next/headers";
import { Orientation } from "./Orientation";
import { TimetableView } from "@/components/Timetable";
import { peek, permanent, timetable, ttKey, weekStart } from "@/lib/bk";
import { addDays, fmtShort, pragueNow } from "@/lib/dates";
import type { Timetable } from "@/lib/types";
import { huesOf } from "@/lib/widgets";
import { Flash, Head, SyncButton, type SP } from "../ui";

export const metadata = { title: "Rozvrh" };

const TABS = [
  { key: "this", param: "tento", label: "Tento týden" },
  { key: "next", param: "pristi", label: "Příští týden" },
  { key: "permanent", param: "staly", label: "Stálý rozvrh" },
] as const;

export default async function TimetablePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.param === sp.t) ?? TABS[0];
  const now = pragueNow();
  // vodorovně (dny ve sloupcích) nebo svisle (dny v řádcích): z adresy, jinak zapamatovaná volba
  const o: "h" | "v" = sp.o === "v" || sp.o === "h" ? sp.o : (await cookies()).get("tt_view")?.value === "v" ? "v" : "h";
  const monday = tab.key === "permanent" ? undefined : weekStart(tab.key);
  // tento týden se smí dočíst z Bakalářů (cache 10 min), ostatní jen z paměti, kterou plní synchronizace na pozadí
  const tt: Timetable | null = tab.key === "permanent" ? await permanent() : tab.key === "this" ? await timetable(monday!) : peek<Timetable>(ttKey(monday!))?.data ?? (await timetable(monday!));
  return (
    <div className="wide">
      <Head title="Rozvrh" sub={tab.key === "permanent" ? "Základní rozvrh bez změn a suplování." : `Aktuální rozvrh z Bakalářů včetně změn · ${fmtShort(monday!)} – ${fmtShort(addDays(monday!, 4))}`}>
        <SyncButton back={`/rozvrh?t=${tab.param}`} />
      </Head>
      <Flash sp={sp} />
      <div className="toolbar">
        <nav className="seg" aria-label="Období">
          {TABS.map((t) => (
            <Link key={t.key} href={`/rozvrh?t=${t.param}&o=${o}`} aria-current={t.key === tab.key}>{t.label}</Link>
          ))}
        </nav>
        <Orientation current={o} t={tab.param} />
      </div>
      {tt ? (
        <TimetableView tt={tt} monday={monday} today={now.date} todayDow={now.dow} vertical={o === "v"} hues={huesOf(tt)} permanent={tab.key === "permanent"} />
      ) : (
        <div className="empty">Rozvrh zatím není načtený. Propoj Bakaláře v <Link href="/nastaveni" className="link-u">Nastavení</Link>.</div>
      )}
    </div>
  );
}
