import type { AbsenceData, ChangeKind, FinalData, HomeworkData, HomeworkItem, Lesson, MarksData, Timetable } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const byId = (list: any[] | undefined): Map<string, any> => new Map((list ?? []).map((x) => [x.Id, x]));

function changeOf(c: any): Lesson["change"] {
  if (!c) return undefined;
  const type = String(c.ChangeType ?? "").toLowerCase();
  let kind: ChangeKind = "other";
  let label = String(c.Description || c.TypeName || "Změna");
  if (/cancel|remov/.test(type)) [kind, label] = ["cancelled", "Odpadá"];
  else if (/substit|added/.test(type)) [kind, label] = ["substitution", "Suplování"];
  else if (/room/.test(type)) [kind, label] = ["room", "Změna učebny"];
  const text = String(c.Description ?? "").trim();
  return { kind, label, ...(text && text !== label ? { text } : {}) };
}

export function normalizeTimetable(raw: any): Timetable {
  const subjects = byId(raw.Subjects);
  const teachers = byId(raw.Teachers);
  const rooms = byId(raw.Rooms);
  const cycles = byId(raw.Cycles);
  const groupLabel = new Map<string, string>((raw.Groups ?? []).map((g: any) => [String(g.Id), g.Name === g.Abbrev ? "celá třída" : `${g.Abbrev} ${g.Name}`]));
  const hours = (raw.Hours ?? [])
    .map((h: any) => ({ hour: Number(h.Caption ?? h.Id), begin: h.BeginTime, end: h.EndTime }))
    .filter((h: any) => Number.isFinite(h.hour));
  const hourById = new Map<number, number>((raw.Hours ?? []).map((h: any) => [h.Id, Number(h.Caption ?? h.Id)]));

  const days: Timetable["days"] = [];
  const lessons: Lesson[] = [];
  for (const d of raw.Days ?? []) {
    const day = Number(d.DayOfWeek);
    if (!(day >= 1 && day <= 7)) continue;
    days.push({
      day,
      date: d.Date ? String(d.Date).slice(0, 10) : undefined,
      description: d.DayDescription || undefined,
    });
    for (const a of d.Atoms ?? []) {
      const subj = a.SubjectId ? subjects.get(a.SubjectId) : undefined;
      const change = changeOf(a.Change);
      lessons.push({
        day,
        hour: hourById.get(a.HourId) ?? Number(a.HourId),
        subject: subj?.Name ?? (change?.kind === "cancelled" ? "Zrušeno" : a.Change?.ChangeSubject || "Hodina"),
        subjectId: a.SubjectId ?? "",
        room: rooms.get(a.RoomId)?.Abbrev ?? "",
        teacher: teachers.get(a.TeacherId)?.Abbrev ?? "",
        groups: (a.GroupIds ?? []).map(String),
        cycles: (a.CycleIds ?? []).map((id: string) => cycles.get(id)?.Name ?? cycles.get(id)?.Abbrev ?? "").filter(Boolean),
        change,
        theme: a.Theme || undefined,
        teacherName: teachers.get(a.TeacherId)?.Name || undefined,
        roomName: rooms.get(a.RoomId)?.Name || undefined,
        groupLabels: (a.GroupIds ?? []).map((id: string) => groupLabel.get(String(id))).filter(Boolean),
      });
    }
  }
  return {
    hours,
    days,
    lessons,
    subjects: (raw.Subjects ?? []).map((s: any) => ({ id: s.Id, name: s.Name, abbrev: s.Abbrev })),
    groups: (raw.Groups ?? []).map((g: any) => ({ id: g.Id, abbrev: g.Abbrev, name: g.Name })),
  };
}

/** "1-" → 1.5, "N" → null */
export function markValue(text: string): number | null {
  const m = /^(\d)(-)?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) + (m[2] ? 0.5 : 0);
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Výsledek v procentech nebo v bodech (například "85 %" nebo 18 z 20 bodů). Má-li ho Bakaláři přepočítaný na známku (CalculatedMarkText), použije se,
 * jinak zůstane bez číselné známky, ale jako procenta, ne jako N (nehodnoceno).
 */
export function percentOf(m: { MarkText?: unknown; PointsText?: unknown; MaxPoints?: unknown; IsPoints?: unknown }): { percent: number | null; points: string } {
  const text = String(m.MarkText ?? "").trim();
  const pts = String(m.PointsText ?? "").trim();
  const max = Number(m.MaxPoints) || 0;
  if (/^\d+([.,]\d+)?\s*%$/.test(text)) return { percent: Math.round(num(text) * 10) / 10, points: "" };
  if (/^\d+([.,]\d+)?\s*%$/.test(pts)) return { percent: Math.round(num(pts) * 10) / 10, points: pts.replace(/\s+/g, "") };
  if (m.IsPoints && pts && max > 0 && Number.isFinite(num(pts))) return { percent: Math.round((num(pts) / max) * 1000) / 10, points: `${pts}/${max}` };
  return { percent: null, points: m.IsPoints && pts ? pts : "" };
}

export function normalizeMarks(raw: any): MarksData {
  const pr = (m: any) => percentOf(m);
  return {
    subjects: (raw.Subjects ?? []).map((s: any) => {
      const id = String(s.Subject?.Id ?? "");
      const name = String(s.Subject?.Name ?? "");
      return {
        id,
        name,
        averageText: String(s.AverageText ?? ""),
        temporary: String(s.TemporaryMark ?? "").trim(),
        temporaryNote: String(s.TemporaryMarkNote ?? "").trim(),
        marks: (s.Marks ?? []).map((m: any) => ({
          id: String(m.Id),
          subjectId: id,
          subject: name,
          caption: String(m.Caption || m.Theme || "Známka"),
          theme: String(m.Theme ?? ""),
          text: pr(m).points || String(m.MarkText ?? ""),
          value: m.IsPoints ? markValue(String(m.CalculatedMarkText ?? "")) : markValue(String(m.MarkText ?? "")),
          percent: pr(m).percent,
          weight: Number(m.Weight) || 1,
          date: String(m.MarkDate ?? "").slice(0, 10),
          isNew: Boolean(m.IsNew),
        })),
      };
    }),
  };
}

/** Hodina bez předmětu v Bakalářích (obvykle třídnická) přijde s prázdným názvem; v přehledu absence po předmětech se vůbec neukazuje a nepočítá se do něj. */
export const namedAbsence = <T extends { name: string }>(subjects: T[]) => subjects.filter((s) => s.name.trim());

export function normalizeAbsence(raw: any): AbsenceData {
  const n = (v: unknown) => Number(v) || 0;
  return {
    threshold: n(raw.PercentageThreshold) > 0 ? n(raw.PercentageThreshold) : 0.25,
    days: (raw.Absences ?? [])
      .map((a: any) => ({ date: String(a.Date ?? "").slice(0, 10), missed: n(a.Missed), excused: n(a.Ok), unsolved: n(a.Unsolved), late: n(a.Late), soon: n(a.Soon), school: n(a.School) }))
      .filter((d: any) => d.date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date)),
    subjects: namedAbsence<AbsenceData["subjects"][number]>((raw.AbsencesPerSubject ?? []).map((s: any) => ({ name: String(s.SubjectName ?? ""), lessons: n(s.LessonsCount), missed: n(s.Base), late: n(s.Late), soon: n(s.Soon), school: n(s.School) }))),
  };
}

export function normalizeHomework(raw: any): HomeworkData {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    items: (raw?.Homeworks ?? [])
      .map((h: any) => ({
        id: str(h.ID), subjectId: str(h.Subject?.Id), subject: str(h.Subject?.Name) || str(h.Subject?.Abbrev), teacher: str(h.Teacher?.Name),
        content: str(h.Content).trim(), notice: str(h.Notice).trim(),
        start: str(h.DateStart).slice(0, 10), end: str(h.DateEnd).slice(0, 10), hour: Number(h.Hour) || 0,
        done: !!h.Done || !!h.Finished, closed: !!h.Closed, attachments: (h.Attachments ?? []).map((a: any) => ({ id: str(a.Id), name: str(a.Name) || "příloha", size: Number(a.Size) || 0 })).filter((a: { id: string }) => a.id),
      }))
      .filter((h: HomeworkItem) => h.id && h.end)
      .sort((a: HomeworkItem, b: HomeworkItem) => a.end.localeCompare(b.end)),
  };
}

export function weightedAverage(marks: { value: number | null; weight: number }[]) {
  let sum = 0;
  let w = 0;
  for (const m of marks) {
    if (m.value == null) continue;
    sum += m.value * m.weight;
    w += m.weight;
  }
  return w ? sum / w : null;
}

/** Vysvědčení: pololetí od nejnovějšího; názvy předmětů se berou z přiloženého seznamu předmětů téhož pololetí. */
export function normalizeFinal(raw: any): FinalData {
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const terms = (raw?.CertificateTerms ?? []).map((t: any) => {
    const names = new Map<string, string>((t.Subjects ?? []).map((s: any) => [str(s.Id), str(s.Name)]));
    return {
      year: str(t.SchoolYear),
      semester: str(t.Semester),
      semesterName: str(t.SemesterName),
      closed: Boolean(t.Closed),
      average: typeof t.MarksAverage === "number" && t.MarksAverage > 0 ? t.MarksAverage : null,
      achievement: str(t.AchievementText).trim(),
      absent: Number(t.AbsentHours) || 0,
      notExcused: Number(t.NotExcusedHours) || 0,
      date: str(t.CertificateDate).slice(0, 10),
      marks: (t.FinalMarks ?? []).map((m: any) => ({ subject: names.get(str(m.SubjectId)) ?? "", text: str(m.MarkText), date: str(m.MarkDate).slice(0, 10) })).filter((m: any) => m.subject && m.text),
    };
  });
  return { terms: terms.sort((a: any, b: any) => b.year.localeCompare(a.year) || b.semester.localeCompare(a.semester)) };
}
