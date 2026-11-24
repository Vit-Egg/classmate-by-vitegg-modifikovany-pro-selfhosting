/**
 * Výsledná tabulka Sportovní deník (SSPŠ): vyplní se školní šablona public/sportovni-denik-sablona.xlsx, takže zůstane přesně v podobě, kterou škola vyžaduje
 * (vzorce, výběry, barvy, list Hodnocení pro učitele). Vyplňují se jen žlutá pole žáka. Vzorce Excel dopočítá při otevření.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { getProfile, listEntries, listReflections, MAX_ENTRIES, MAX_REFLECTIONS, summarize, yearLabel } from "./training";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Ke vzorci přidá vypočtenou hodnotu: Excel ji při otevření stejně přepočítá, ale prohlížeče souborů (náhled, telefon) vzorce nepočítají a ukázaly by staré nuly ze šablony. */
function withResult(cell: ExcelJS.Cell, result: number | string) {
  const v = cell.value;
  if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) cell.value = { ...(v as object), result } as ExcelJS.CellValue;
}

export async function trainingWorkbook(user: { id: number; name: string; class_name: string }, year: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), "public", "sportovni-denik-sablona.xlsx"));
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`V šabloně chybí list ${name}`);
    return ws;
  };

  const p = getProfile(user.id);
  const head = sheet("ZAČÍT ZDE");
  const put = (cell: string, v: string | Date) => (head.getCell(cell).value = v);
  put("B5", user.name);
  put("F5", user.class_name);
  put("B6", yearLabel(year));
  if (p.sport) put("F6", p.sport);
  if (p.club) put("B7", p.club);
  if (p.category) put("F7", p.category);
  if (p.frequency) put("B8", p.frequency);
  for (const [cell, iso] of [["F8", p.submit1], ["B9", p.submit2]]) {
    if (!iso) continue;
    put(cell, utc(iso));
    head.getCell(cell).numFmt = "dd.mm.yyyy"; // buňky v šabloně nemají formát data
    head.getCell(cell).alignment = { ...head.getCell(cell).alignment, horizontal: "left" };
  }
  if (p.teacher) put("F9", p.teacher);

  for (const half of [1, 2] as const) {
    const diary = sheet(`DENÍK ${half}. POL.`);
    const entries = listEntries(user.id, year, half);
    entries.slice(0, MAX_ENTRIES).forEach((e, i) => {
      const r = 9 + i;
      diary.getCell(`A${r}`).value = utc(e.date);
      diary.getCell(`B${r}`).value = e.type;
      diary.getCell(`C${r}`).value = e.minutes;
      if (e.rpe !== null) diary.getCell(`D${r}`).value = e.rpe;
      if (e.content) diary.getCell(`E${r}`).value = e.content;
      if (e.goal) diary.getCell(`F${r}`).value = e.goal;
      if (e.note) diary.getCell(`G${r}`).value = e.note;
    });
    const shown = entries.slice(0, MAX_ENTRIES);
    const sum = summarize(shown);
    withResult(diary.getCell("E4"), sum.minutes);
    withResult(diary.getCell("G4"), sum.matches);
    withResult(diary.getCell("B5"), sum.trainings);
    withResult(diary.getCell("E5"), sum.minutes / 60);
    withResult(diary.getCell("G5"), sum.avgRpe === null ? "" : shown.filter((e) => e.rpe !== null).reduce((n, e) => n + e.rpe!, 0) / shown.filter((e) => e.rpe !== null).length);
    withResult(diary.getCell("G6"), shown.length);
    for (let r = 9; r <= 168; r++) {
      const e = shown[r - 9];
      withResult(diary.getCell(`H${r}`), e && e.rpe !== null ? e.minutes * e.rpe : "");
    }
    const refl = sheet(`REFLEXE ${half}. POL.`);
    const reflections = listReflections(user.id, year, half).slice(0, MAX_REFLECTIONS);
    for (let r = 8; r < 8 + MAX_REFLECTIONS; r++) {
      const x = reflections[r - 8];
      const week = x ? shown.filter((e) => e.date >= x.week_from && e.date <= x.week_to) : [];
      withResult(refl.getCell(`C${r}`), x ? week.filter((e) => e.type !== "Volno" && e.type !== "Regenerace").length : "");
      withResult(refl.getCell(`D${r}`), x ? week.reduce((n, e) => n + e.minutes, 0) : "");
    }
    reflections.forEach((x, i) => {
      const r = 8 + i;
      refl.getCell(`A${r}`).value = utc(x.week_from);
      refl.getCell(`B${r}`).value = utc(x.week_to);
      if (x.goal) refl.getCell(`E${r}`).value = x.goal;
      if (x.achieved) refl.getCell(`F${r}`).value = x.achieved;
      if (x.improve) refl.getCell(`G${r}`).value = x.improve;
      if (x.rating !== null) refl.getCell(`H${r}`).value = x.rating;
      if (x.filled_on) refl.getCell(`I${r}`).value = utc(x.filled_on);
    });
  }
  wb.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
