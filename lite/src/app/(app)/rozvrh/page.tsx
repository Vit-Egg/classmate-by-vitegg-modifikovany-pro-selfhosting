import Link from "next/link";
import { peek, timetable, ttKey, weekStart } from "@/lib/bk";
import { addDays, pragueNow } from "@/lib/dates";
import type { Timetable } from "@/lib/types";
import { dayLessons } from "@/lib/widgets";
import { Flash, SyncButton, type SP } from "../ui";

export const metadata = { title: "Rozvrh" };

const DAYS = ["Po", "Út", "St", "Čt", "Pá"];
const d = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export default async function TimetablePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const which = sp.w === "next" ? "next" : "this";
  const monday = weekStart(which);
  // aktuální týden se smí dočíst z Bakalářů (cache 10 min), jiný jen z paměti
  const tt = (await timetable(monday)) ?? peek<Timetable>(ttKey(monday))?.data ?? null;
  const today = pragueNow().date;
  const hours = tt?.hours.filter((h) => tt.lessons.some((l) => l.hour === h.hour)) ?? [];
  return (
    <>
      <div className="head">
        <div>
          <h1>Rozvrh</h1>
          <p className="sub">Týden od {d(monday)} · zrušené hodiny přeškrtnuté, změny zvýrazněné</p>
        </div>
        <SyncButton back={`/rozvrh${which === "next" ? "?w=next" : ""}`} />
      </div>
      <Flash sp={sp} />
      <div className="row" style={{ marginBottom: 14 }}>
        <Link className="btn small" href="/rozvrh" aria-current={which === "this" ? "page" : undefined} style={which === "this" ? { fontWeight: 600 } : undefined}>Tento týden</Link>
        <Link className="btn small" href="/rozvrh?w=next" style={which === "next" ? { fontWeight: 600 } : undefined}>Příští týden</Link>
      </div>
      {!tt ? (
        <div className="card">Rozvrh zatím není načtený. Propoj Bakaláře v Nastavení.</div>
      ) : (
        <div className="card tt">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }} />
                {hours.map((h) => (
                  <th key={h.hour}>
                    {h.hour}. <span className="mut">{h.begin}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((name, i) => {
                const date = addDays(monday, i);
                const lessons = dayLessons(tt, i + 1);
                const note = tt.days.find((x) => x.day === i + 1)?.description;
                return (
                  <tr key={name} style={date === today ? { background: "color-mix(in srgb, var(--acc) 7%, transparent)" } : undefined}>
                    <th>
                      {name}
                      <br />
                      <span className="mut">{d(date)}</span>
                    </th>
                    {note && !lessons.length ? (
                      <td colSpan={hours.length} className="mut">{note}</td>
                    ) : (
                      hours.map((h) => {
                        const l = lessons.find((x) => x.hour === h.hour);
                        return (
                          <td key={h.hour} className={[l?.cancelled ? "x" : "", l?.change ? "chg" : ""].join(" ")}>
                            {l && (
                              <>
                                <b>{l.subject || "—"}</b>
                                <span className="mut">{[l.room, l.teacher].filter(Boolean).join(" · ")}</span>
                                {l.change && <div className="c">{l.change}</div>}
                              </>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
