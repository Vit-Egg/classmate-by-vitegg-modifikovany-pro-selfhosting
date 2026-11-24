import { peek, ttKey, weekStart } from "@/lib/bk";
import { addDays } from "@/lib/dates";
import { forbidden, keyOk } from "@/lib/embed/core";
import type { Timetable } from "@/lib/types";
import { dayLessons } from "@/lib/widgets";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (date: string, hhmm: string) => `${date.replace(/-/g, "")}T${hhmm.replace(":", "").padStart(4, "0")}00`;

/**
 * Rozvrh tohoto a příštího týdne jako kalendář ICS (čas Europe/Prague). Formát je navržený pro snadné spárování se stálým rozvrhem:
 * SUMMARY = název předmětu, přesný začátek hodiny, zrušená hodina má STATUS:CANCELLED a v popisu „odpadá“, změna má v popisu „suplování“ / text změny.
 */
export async function GET(req: Request) {
  if (!keyOk(new URL(req.url).searchParams.get("k"))) return forbidden();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//vitegg//Classmate lite//CS", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Rozvrh", "X-WR-TIMEZONE:Europe/Prague", "REFRESH-INTERVAL;VALUE=DURATION:PT30M"];
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const monday of [weekStart("this"), weekStart("next")]) {
    const tt = peek<Timetable>(ttKey(monday))?.data;
    if (!tt) continue;
    for (let dow = 1; dow <= 5; dow++) {
      const date = addDays(monday, dow - 1);
      for (const l of dayLessons(tt, dow)) {
        if (!l.begin || !l.end) continue;
        const desc = [l.cancelled ? "odpadá" : l.change ? `suplování: ${l.change}` : "", l.teacher ? `vyučující: ${l.teacher}` : "", `${l.hour}. hodina`].filter(Boolean).join("\n");
        lines.push(
          "BEGIN:VEVENT",
          `UID:${date}-${l.hour}@classmate-lite`,
          `DTSTAMP:${now}`,
          `DTSTART;TZID=Europe/Prague:${stamp(date, l.begin)}`,
          `DTEND;TZID=Europe/Prague:${stamp(date, l.end)}`,
          `SUMMARY:${esc(l.subject || "Hodina")}`,
          ...(l.room ? [`LOCATION:${esc(l.room)}`] : []),
          `DESCRIPTION:${esc(desc)}`,
          `STATUS:${l.cancelled ? "CANCELLED" : "CONFIRMED"}`,
          "END:VEVENT",
        );
      }
    }
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
