/**
 * Převod Markdown ⇄ dokument editoru poznámek (ProseMirror JSON, schéma Tiptap StarterKit).
 * Slouží MCP serveru, aby AI mohla poznámky číst a psát běžným Markdownem. Matematika `$…$` zůstává prostým textem,
 * stejně jako v editoru (LaTeX Suite).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

/* ---------- Markdown → dokument ---------- */

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

const INLINE: { re: RegExp; make: (m: RegExpExecArray, marks: Mark[]) => Node[] | null }[] = [
  { re: /`([^`]+)`/, make: (m, marks) => [{ type: "text", text: m[1], marks: [...marks, { type: "code" }] }] },
  // matematika zůstane beze změny (neformátuje se uvnitř)
  { re: /(?<![\\$])\$\$(.+?)\$\$|(?<![\\$])\$(?!\$)([^\s$](?:[^$]*?[^\s$\\])?)\$(?!\$)/, make: (m, marks) => [{ type: "text", text: m[0], ...(marks.length ? { marks } : {}) }] },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    make: (m, marks) => (SAFE_HREF.test(m[2]) ? inline(m[1], [...marks, { type: "link", attrs: { href: m[2] } }]) : inline(m[1], marks)),
  },
  { re: /\*\*(.+?)\*\*|__(.+?)__/, make: (m, marks) => inline(m[1] ?? m[2], [...marks, { type: "bold" }]) },
  { re: /~~(.+?)~~/, make: (m, marks) => inline(m[1], [...marks, { type: "strike" }]) },
  { re: /==(.+?)==/, make: (m, marks) => inline(m[1], [...marks, { type: "highlight" }]) },
  { re: /(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/, make: (m, marks) => inline(m[1] ?? m[2], [...marks, { type: "italic" }]) },
];

function inline(text: string, marks: Mark[] = []): Node[] {
  const out: Node[] = [];
  let rest = text;
  while (rest) {
    let best: { idx: number; m: RegExpExecArray; i: number } | null = null;
    INLINE.forEach((p, i) => {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.idx)) best = { idx: m.index, m, i };
    });
    if (!best) break;
    const b = best as { idx: number; m: RegExpExecArray; i: number };
    if (b.idx > 0) out.push({ type: "text", text: rest.slice(0, b.idx), ...(marks.length ? { marks } : {}) });
    out.push(...(INLINE[b.i].make(b.m, marks) ?? []));
    rest = rest.slice(b.idx + b.m[0].length);
  }
  if (rest) out.push({ type: "text", text: rest, ...(marks.length ? { marks } : {}) });
  return out.filter((n) => n.text !== "");
}

const paragraph = (text: string): Node => {
  const content = inline(text.replace(/\\\n/g, " ").trim());
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const listMatch = (l: string) => /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/.exec(l);

const IMG_LINE = /^\s*!\[([^\]]*)\]\((\/poznamky\/\d+\/obrazek\/\d+)\)\s*$/;

function parseBlocks(lines: string[]): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push({ type: "codeBlock", attrs: { language: fence[2] || null }, ...(body.length ? { content: [{ type: "text", text: body.join("\n") }] } : {}) });
      continue;
    }
    // samostatný vzorec přes víc řádků: $$ … $$
    if (/^\s*\$\$\s*$/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) body.push(lines[i++].trim());
      i++;
      out.push({ type: "paragraph", content: [{ type: "text", text: `$$ ${body.join(" ")} $$` }] });
      continue;
    }
    const img = IMG_LINE.exec(line);
    if (img) { out.push({ type: "image", attrs: { src: img[2], alt: img[1] || null, title: null } }); i++; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push({ type: "heading", attrs: { level: Math.min(h[1].length, 3) }, content: inline(h[2]) }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ type: "horizontalRule" }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ type: "blockquote", content: parseBlocks(body) });
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows: Node[] = [];
      const head = cells(line);
      const mk = (type: string, t: string): Node => ({ type, content: [paragraph(t)] });
      rows.push({ type: "tableRow", content: head.map((c) => mk("tableHeader", c)) });
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        const r = cells(lines[i++]);
        rows.push({ type: "tableRow", content: head.map((_, k) => mk("tableCell", r[k] ?? "")) });
      }
      out.push({ type: "table", content: rows });
      continue;
    }
    if (listMatch(line)) {
      const [node, next] = parseList(lines, i);
      out.push(node);
      i = next;
      continue;
    }
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|~~~|\$\$\s*$)/.test(lines[i]) && !listMatch(lines[i]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) && !(isTableRow(lines[i]) && isTableSep(lines[i + 1] ?? ""))) para.push(lines[i++].trim());
    out.push(paragraph(para.join(" ")));
  }
  return out;
}

function parseList(lines: string[], start: number): [Node, number] {
  const first = listMatch(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const task = !!first[3];
  const items: Node[] = [];
  let i = start;
  while (i < lines.length) {
    const m = listMatch(lines[i]);
    if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered || !!m[3] !== task) break;
    const body = [m[4]];
    const nested: string[] = [];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      const lm = listMatch(l);
      if (lm && lm[1].length <= baseIndent) break;
      if (/^\s{2,}/.test(l) || lm) (lm || nested.length ? nested : body).push(l);
      else break;
      i++;
    }
    const content: Node[] = [paragraph(body.join(" ")), ...(nested.length ? parseBlocks(nested.map((l) => l.slice(Math.min(baseIndent + 2, l.length - l.trimStart().length)))) : [])];
    items.push(task ? { type: "taskItem", attrs: { checked: /x/i.test(m[3]) }, content } : { type: "listItem", content });
  }
  return [{ type: task ? "taskList" : ordered ? "orderedList" : "bulletList", ...(ordered ? { attrs: { start: Number(first[2].replace(/\D/g, "")) || 1 } } : {}), content: items }, i];
}

export function markdownToDoc(md: string): { type: "doc"; content: Node[] } {
  const content = parseBlocks(md.replace(/\r\n?/g, "\n").split("\n"));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ---------- dokument → Markdown / prostý text ---------- */

function marked(n: Node): string {
  let t = n.text ?? "";
  if (!t) return "";
  const has = (name: string) => n.marks?.find((m) => m.type === name);
  if (has("code")) return "`" + t + "`";
  if (has("bold")) t = `**${t}**`;
  if (has("italic")) t = `*${t}*`;
  if (has("strike")) t = `~~${t}~~`;
  if (has("highlight")) t = `==${t}==`;
  const link = has("link");
  if (link) t = `[${t}](${link.attrs?.href ?? ""})`;
  return t;
}

const inl = (n: Node): string => (n.content ?? []).map((c) => (c.type === "hardBreak" ? "  \n" : marked(c))).join("");

function block(n: Node, indent = ""): string {
  const kids = n.content ?? [];
  switch (n.type) {
    case "paragraph": return inl(n);
    case "heading": return "#".repeat((n.attrs?.level as number) || 1) + " " + inl(n);
    case "horizontalRule": return "---";
    case "image": return `![${String(n.attrs?.alt ?? "").replace(/[\[\]]/g, "")}](${n.attrs?.src ?? ""})`;
    case "blockquote": return kids.map((k) => block(k)).join("\n\n").split("\n").map((l) => "> " + l).join("\n");
    case "codeBlock": return "```" + (n.attrs?.language ?? "") + "\n" + kids.map((k) => k.text ?? "").join("") + "\n```";
    case "bulletList":
    case "orderedList":
    case "taskList":
      return kids
        .map((li, idx) => {
          const mark = n.type === "orderedList" ? `${((n.attrs?.start as number) || 1) + idx}. ` : n.type === "taskList" ? `- [${li.attrs?.checked ? "x" : " "}] ` : "- ";
          const [first, ...rest] = (li.content ?? []).map((k) => block(k, indent + "  "));
          return indent + mark + (first ?? "") + (rest.length ? "\n" + rest.map((r) => (/^\s*([-*]|\d+\.)\s/.test(r) ? r : indent + "  " + r)).join("\n") : "");
        })
        .join("\n");
    case "table": {
      const rows = kids.map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inl(p)).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " ")));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => "| " + Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ") + " |";
      return [pad(rows[0]), "|" + " --- |".repeat(width), ...rows.slice(1).map(pad)].join("\n");
    }
    default: return kids.map((k) => block(k)).join("\n\n");
  }
}

export function docToMarkdown(doc: unknown): string {
  const d = doc as Node;
  return (d.content ?? []).map((n) => block(n)).join("\n\n").trim();
}

/** Prostý text pro hledání a náhledy (stejný tvar jako `editor.getText({ blockSeparator: "\n" })`). */
export function docToText(doc: unknown): string {
  const walk = (n: Node): string => {
    if (n.text !== undefined) return n.text;
    if (n.type === "hardBreak") return "\n";
    const inner = (n.content ?? []).map(walk);
    return ["doc", "bulletList", "orderedList", "taskList", "table", "tableRow", "blockquote"].includes(n.type) || n.type === "listItem" || n.type === "taskItem" ? inner.join("\n") : inner.join(n.type === "tableRow" ? "\t" : "");
  };
  return walk(doc as Node).replace(/\n{3,}/g, "\n\n").trim();
}
