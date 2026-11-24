import crypto from "node:crypto";
import type { CalEvent } from "./calendar";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
const ymd = (iso: string) => iso.replaceAll("-", "");
const next = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);

/** iCalendar (.ics): celodenní položky, které jdou nahrát do Google, Apple nebo Outlook kalendáře. */
export function toIcs(events: CalEvent[], name = "Classmate") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Classmate//CS", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H", "X-WR-TIMEZONE:Europe/Prague"];
  const seen = new Map<string, number>();
  events.forEach((e) => {
    // Stabilní UID (kalendáře podle něj poznají, že jde o tutéž položku a nevytvářejí duplicity).
    const base = crypto.createHash("sha1").update([e.kind, e.date, e.time ?? "", e.title].join("|")).digest("hex").slice(0, 24);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${base}${n ? `-${n}` : ""}@classmate`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`,
      `DTEND;VALUE=DATE:${ymd(next(e.date))}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.sub || e.time ? [`DESCRIPTION:${esc([e.time, e.sub].filter(Boolean).join(" · "))}`] : []),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
