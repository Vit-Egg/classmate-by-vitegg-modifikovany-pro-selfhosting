/**
 * Import souboru jako poznámky: .txt, .md a .docx (Word). Výsledkem je dokument editoru poznámek (ProseMirror JSON).
 * Word se čte přímo (zip + XML): nadpisy, odstavce, tučné, kurzíva, přeškrtnutí, zvýraznění, odrážky a číslované seznamy i vnořené, tabulky.
 * Obrázky, poznámky pod čarou a komentáře se nepřenášejí. Vstupy jsou omezené, aby šlo importovat jen rozumně velké soubory.
 */
import zlib from "node:zlib";
import { markdownToDoc } from "./markdown";

export class ImportError extends Error {}

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

type Mark = { type: string };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };
export type Imported = { title: string; doc: { type: "doc"; content: Node[] } };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));

/* ---------- zip (jen to, co docx potřebuje) ---------- */

const MAX_INFLATED = 24 * 1024 * 1024;

function unzip(buf: Buffer, wanted: string[]): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError("Soubor není platný dokument Word (.docx).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.includes(name) || local + 30 > buf.length) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    try {
      out.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw, { maxOutputLength: MAX_INFLATED }));
    } catch {
      throw new ImportError("Dokument Word se nepodařilo rozbalit (je poškozený nebo moc velký).");
    }
  }
  return out;
}

/* ---------- Word ---------- */

const attr = (xml: string, tag: string, name = "w:val") => new RegExp(`<${tag}\\b[^>]*?\\b${name}="([^"]*)"`).exec(xml)?.[1];
const on = (rpr: string, tag: string) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?/?>`).exec(rpr);
  if (!m) return false;
  const v = /w:val="([^"]*)"/.exec(m[0])?.[1];
  return v === undefined || !/^(0|false|off)$/i.test(v);
};

function runs(pXml: string): Node[] {
  const out: Node[] = [];
  const push = (n: Node) => {
    const last = out[out.length - 1];
    if (n.type === "text" && last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(n.marks ?? [])) last.text = (last.text ?? "") + (n.text ?? "");
    else out.push(n);
  };
  for (const m of pXml.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const r = m[1];
    const rpr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r)?.[1] ?? "";
    const marks: Mark[] = [];
    if (on(rpr, "w:b")) marks.push({ type: "bold" });
    if (on(rpr, "w:i")) marks.push({ type: "italic" });
    if (on(rpr, "w:strike")) marks.push({ type: "strike" });
    if (/<w:highlight\b/.test(rpr) && attr(rpr, "w:highlight") !== "none") marks.push({ type: "highlight" });
    for (const t of r.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>/g)) {
      if (t[0].startsWith("<w:br")) push({ type: "hardBreak" });
      else {
        const text = t[1] !== undefined ? decode(t[1]) : "    ";
        if (text) push({ type: "text", text, ...(marks.length ? { marks } : {}) });
      }
    }
  }
  return out;
}

type Item = { level: number; ordered: boolean; content: Node[] };

function nestLists(items: Item[]): Node[] {
  const root: Node[] = [];
  const stack: { level: number; ordered: boolean; list: Node }[] = [];
  for (const it of items) {
    while (stack.length && stack[stack.length - 1].level > it.level) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.level < it.level || top.ordered !== it.ordered) {
      if (top && top.level === it.level) stack.pop();
      const list: Node = { type: it.ordered ? "orderedList" : "bulletList", content: [] };
      const parent = stack[stack.length - 1];
      const host = parent?.list.content?.[parent.list.content.length - 1];
      if (host) (host.content ??= []).push(list);
      else root.push(list);
      top = { level: it.level, ordered: it.ordered, list };
      stack.push(top);
    }
    top.list.content!.push({ type: "listItem", content: [{ type: "paragraph", ...(it.content.length ? { content: it.content } : {}) }] });
  }
  return root;
}

function docx(buf: Buffer): Imported {
  const files = unzip(buf, ["word/document.xml", "word/numbering.xml"]);
  const xml = files.get("word/document.xml")?.toString("utf8");
  if (!xml) throw new ImportError("V souboru chybí text dokumentu. Je to opravdu dokument Word (.docx)?");

  // číslované × odrážkové seznamy podle numbering.xml
  const orderedOf = new Map<string, boolean>();
  const numbering = files.get("word/numbering.xml")?.toString("utf8");
  if (numbering) {
    const abstract = new Map<string, Map<string, boolean>>();
    for (const a of numbering.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
      const lv = new Map<string, boolean>();
      for (const l of a[2].matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) lv.set(l[1], attr(l[2], "w:numFmt") !== "bullet");
      abstract.set(a[1], lv);
    }
    for (const n of numbering.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
      const lv = abstract.get(attr(n[2], "w:abstractNumId") ?? "");
      if (lv) for (const [ilvl, o] of lv) orderedOf.set(`${n[1]}:${ilvl}`, o);
    }
  }

  const blocks: Node[] = [];
  let pending: Item[] = [];
  const flush = () => {
    if (pending.length) blocks.push(...nestLists(pending));
    pending = [];
  };
  let title = "";
  const paragraph = (p: string): { node: Node | null; item?: Item; heading?: boolean } => {
    const content = runs(p);
    const ppr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? "";
    const style = attr(ppr, "w:pStyle") ?? "";
    const numId = attr(/<w:numPr>[\s\S]*?<\/w:numPr>/.exec(ppr)?.[0] ?? "", "w:numId");
    if (numId && numId !== "0") {
      const ilvl = attr(/<w:numPr>[\s\S]*?<\/w:numPr>/.exec(ppr)?.[0] ?? "", "w:ilvl") ?? "0";
      return { node: null, item: { level: Number(ilvl) || 0, ordered: orderedOf.get(`${numId}:${ilvl}`) ?? false, content } };
    }
    const h = /^(?:heading|nadpis)\s*(\d)/i.exec(style) ?? (/^(title|nazev|název)$/i.test(style) ? [0, "1"] : null);
    if (h && content.length) return { node: { type: "heading", attrs: { level: Math.min(4, Math.max(1, Number(h[1]))) }, content }, heading: true };
    return { node: { type: "paragraph", ...(content.length ? { content } : {}) } };
  };

  for (const m of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (m[0].startsWith("<w:tbl>")) {
      flush();
      const rows: Node[] = [];
      for (const r of m[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const cells: Node[] = [];
        for (const c of r[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
          const paras = [...c[1].matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((x) => runs(x[0]));
          const flat: Node[] = [];
          paras.forEach((ps, i) => {
            if (i && ps.length) flat.push({ type: "hardBreak" });
            flat.push(...ps);
          });
          cells.push({ type: rows.length ? "tableCell" : "tableHeader", content: [{ type: "paragraph", ...(flat.length ? { content: flat } : {}) }] });
        }
        if (cells.length) rows.push({ type: "tableRow", content: cells });
      }
      if (rows.length) blocks.push({ type: "table", content: rows });
      continue;
    }
    const r = paragraph(m[0]);
    if (r.item) pending.push(r.item);
    else {
      flush();
      if (r.node) {
        if (!title && r.heading) title = (r.node.content ?? []).map((n) => n.text ?? "").join("").trim();
        blocks.push(r.node);
      }
    }
  }
  flush();
  while (blocks.length && blocks[blocks.length - 1].type === "paragraph" && !blocks[blocks.length - 1].content) blocks.pop(); // prázdné odstavce na konci
  return { title, doc: { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] } };
}

/* ---------- prostý text ---------- */

function plain(text: string): Imported {
  const blocks: Node[] = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.replace(/^\n+|\n+$/g, ""))
    .filter((b) => b.trim())
    .map((b) => ({
      type: "paragraph",
      content: b.split("\n").flatMap((l, i): Node[] => [...(i ? [{ type: "hardBreak" }] : []), ...(l ? [{ type: "text", text: l }] : [])]),
    }));
  return { title: "", doc: { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] } };
}

/** Převede nahraný soubor na obsah poznámky. Název z dokumentu (první nadpis) se vrátí, když existuje. */
export function importNote(name: string, data: Buffer): Imported {
  if (!data.length) throw new ImportError("Soubor je prázdný.");
  if (data.length > MAX_IMPORT_BYTES) throw new ImportError("Soubor je moc velký (nejvíc 8 MB).");
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (ext === ".docx") return docx(data);
  if (ext === ".md" || ext === ".markdown") {
    const text = data.toString("utf8").replace(/^﻿/, "");
    if (text.includes("\u0000")) throw new ImportError("Tohle není textový soubor.");
    const h1 = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? "";
    return { title: h1, doc: markdownToDoc(text) as Imported["doc"] };
  }
  if (ext === ".txt") {
    const text = data.toString("utf8").replace(/^﻿/, "");
    if (text.includes("\u0000")) throw new ImportError("Tohle není textový soubor.");
    return plain(text);
  }
  throw new ImportError("Tenhle typ souboru zatím neumím. Nahraj .docx (Word), .md nebo .txt.");
}
