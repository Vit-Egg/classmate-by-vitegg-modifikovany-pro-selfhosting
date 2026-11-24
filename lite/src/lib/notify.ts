/**
 * Upozornění přes ntfy (volitelné, NTFY_URL v .env): nové známky, změny v rozvrhu, nová absence a zprávy Komens.
 * Při prvním načtení (bez předchozí kopie) se jen uloží základ a nic se neposílá.
 */
import type { AbsenceData, MarksData, Timetable } from "./types";
import { absenceHours } from "./types";
import { publicBase } from "./embed/core";

type Msg = { title: string; body: string; path: string; tags?: string };

function send(m: Msg) {
  const url = process.env.NTFY_URL?.trim();
  if (!url || !/^https:\/\//i.test(url)) return;
  const enc = (s: string) => encodeURIComponent(s);
  void fetch(url, {
    method: "POST",
    body: m.body,
    headers: { Title: `=?UTF-8?B?${Buffer.from(m.title).toString("base64")}?=`, Click: `${publicBase()}${m.path}`, ...(m.tags ? { Tags: enc(m.tags) } : {}) },
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error("ntfy failed", e));
}

export function onMarks(data: MarksData, prev: MarksData | null) {
  if (!prev) return;
  const had = new Set(prev.subjects.flatMap((s) => s.marks.map((m) => m.id)));
  const fresh = data.subjects.flatMap((s) => s.marks.filter((m) => !had.has(m.id)).map((m) => ({ s, m })));
  for (const { s, m } of fresh.slice(0, 5)) send({ title: `Nová známka: ${s.name} ${m.text || m.value || ""}`.trim(), body: [m.caption || m.theme, m.weight ? `váha ${m.weight}` : ""].filter(Boolean).join(" · ") || s.name, path: "/znamky", tags: "memo" });
}

export function onTimetable(monday: string, data: Timetable, prev: Timetable | null) {
  if (!prev) return;
  const key = (l: Timetable["lessons"][number]) => `${l.day}-${l.hour}-${l.change?.kind ?? ""}-${l.change?.label ?? ""}-${l.subject}-${l.room}`;
  const had = new Set(prev.lessons.map(key));
  const changed = data.lessons.filter((l) => l.change && !had.has(key(l)));
  const day = (d: number) => ["pondělí", "úterý", "středa", "čtvrtek", "pátek"][d - 1] ?? "";
  for (const l of changed.slice(0, 5)) send({ title: `Změna v rozvrhu: ${day(l.day)} ${l.hour}. hodina`, body: `${l.subject || "Hodina"}: ${l.change?.label ?? "změna"}${l.change?.text ? ` · ${l.change.text}` : ""}`, path: `/rozvrh?w=${monday}`, tags: "calendar" });
}

export function onAbsence(data: AbsenceData, prev: AbsenceData | null) {
  if (!prev) return;
  const total = (a: AbsenceData) => a.days.reduce((n, d) => n + absenceHours(d), 0);
  const diff = total(data) - total(prev);
  if (diff > 0) send({ title: "Nová absence", body: `Přibylo ${diff} zameškaných hodin.`, path: "/absence", tags: "warning" });
}

export function onKomens(data: { id: string; title: string; sender: string; read: boolean; text: string }[], prev: { id: string }[] | null) {
  if (!prev) return;
  const had = new Set(prev.map((m) => m.id));
  for (const m of data.filter((m) => !had.has(m.id) && !m.read).slice(0, 5)) send({ title: `Komens: ${m.title}`, body: `${m.sender}${m.text ? ` · ${m.text.slice(0, 200)}` : ""}`, path: "/komens", tags: "envelope" });
}
