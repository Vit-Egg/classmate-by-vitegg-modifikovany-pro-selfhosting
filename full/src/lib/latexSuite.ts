/**
 * LaTeX Suite pro editor poznámek (inspirováno pluginem pro Obsidian).
 *  – matematika se píše jako běžný text mezi $…$ (řádková) a $$…$$ (samostatná), takže se dobře hledá i exportuje,
 *  – mimo kurzor se vzorec vykreslí přes KaTeX, v kurzoru se ukáže zdroj,
 *  – ve vzorci fungují snippety (// zlomek, sq odmocnina, @a α …), automatické závorky a Tab pro vyskočení ven.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import katex from "katex";
import { MACROS } from "./katex-macros";
import { calcLatex, type CalcResult } from "./latexCalc";

/* ---------- pomocné: text bloku a oblasti vzorců ---------- */

/** Text odstavce se stejnou délkou jako jeho obsah v dokumentu; kód a atomy se zamaskují. */
function blockText(block: PMNode) {
  let out = "";
  block.forEach((child) => {
    if (child.isText) out += child.marks.some((m) => m.type.name === "code") ? "�".repeat(child.nodeSize) : child.text;
    else out += "￼".repeat(child.nodeSize);
  });
  return out;
}

type Range = { from: number; to: number; latex: string; display: boolean; delim: number };
const MATH = /(?<!\\)\$\$(.+?)\$\$|(?<![\\$])\$(?!\$)([^\s$](?:[^$]*?[^\s$\\])?)\$(?!\$)/g;

function mathRanges(block: PMNode, start: number): Range[] {
  const text = blockText(block);
  const out: Range[] = [];
  for (const m of text.matchAll(MATH)) {
    const display = m[1] !== undefined;
    const delim = display ? 2 : 1;
    const from = start + (m.index ?? 0);
    out.push({ from, to: from + m[0].length, latex: (display ? m[1] : m[2]).trim(), display, delim });
  }
  return out;
}

/** Je kurzor na pozici idx uvnitř $…$ / $$…$$ (i nedokončeného)? */
function inMathAt(text: string, idx: number) {
  let mode: "none" | "inline" | "block" = "none";
  for (let i = 0; i < idx; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "$" && text[i + 1] === "$") {
      mode = mode === "block" ? "none" : mode === "none" ? "block" : mode;
      i++;
    } else if (c === "$") mode = mode === "inline" ? "none" : mode === "none" ? "inline" : mode;
  }
  return mode !== "none";
}

/** Kde ve vzorci právě začíná jeho obsah (index za otevíracím $ nebo $$), nebo -1, když kurzor ve vzorci není. */
function mathStartAt(text: string, idx: number) {
  let mode: "none" | "inline" | "block" = "none";
  let start = -1;
  for (let i = 0; i < idx; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "$" && text[i + 1] === "$") {
      mode = mode === "block" ? "none" : mode === "none" ? "block" : mode;
      if (mode === "block") start = i + 2;
      i++;
    } else if (c === "$") {
      mode = mode === "inline" ? "none" : mode === "none" ? "inline" : mode;
      if (mode === "inline") start = i + 1;
    }
  }
  return mode === "none" ? -1 : start;
}

/**
 * Návrh výsledku: kurzor je ve vzorci hned za „=“ a výraz před ním jde spočítat (2+3= → 5, \frac{1}{2}+\frac{1}{3}= → \frac{5}{6}).
 * Ukáže se jako šedý text za kurzorem, Tab ho vloží.
 */
function suggestionAt(state: EditorState): { res: CalcResult } | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $p = state.doc.resolve(sel.from);
  const block = $p.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const text = blockText(block);
  const idx = sel.from - $p.start();
  if (text[idx - 1] !== "=" || /[<>!~\\:=]/.test(text[idx - 2] ?? "")) return null;
  const start = mathStartAt(text, idx);
  if (start < 0) return null;
  const rest = text.slice(idx).trimStart();
  if (rest && !rest.startsWith("$")) return null;
  const parts = text.slice(start, idx - 1).split(/(?<![<>!~\\:])=/);
  const expr = parts[parts.length - 1].trim();
  if (!expr) return null;
  const res = calcLatex(expr);
  return res ? { res } : null;
}

function suggestWidget(res: CalcResult) {
  const el = document.createElement("span");
  el.className = "math-suggest";
  el.contentEditable = "false";
  el.title = "Tab vloží výsledek";
  const val = document.createElement("span");
  val.className = "math-suggest-val";
  val.innerHTML = katex.renderToString(`${res.approx ? "\\approx " : ""}${res.text}`, { throwOnError: false, strict: "ignore", trust: false, output: "html", macros: { ...MACROS } });
  const kbd = document.createElement("kbd");
  kbd.textContent = "Tab";
  el.append(val, kbd);
  return el;
}

/* ---------- snippety ---------- */

type Snippet = { t: string; r: string; word?: boolean };
const sn = (t: string, r: string, word = false): Snippet => ({ t, r, word });

const GREEK: [string, string][] = [
  ["a", "alpha"], ["b", "beta"], ["g", "gamma"], ["G", "Gamma"], ["d", "delta"], ["D", "Delta"], ["e", "epsilon"], ["z", "zeta"], ["h", "eta"],
  ["t", "theta"], ["T", "Theta"], ["k", "kappa"], ["l", "lambda"], ["L", "Lambda"], ["m", "mu"], ["n", "nu"], ["x", "xi"], ["p", "pi"], ["P", "Pi"],
  ["r", "rho"], ["s", "sigma"], ["S", "Sigma"], ["u", "upsilon"], ["f", "phi"], ["F", "Phi"], ["c", "chi"], ["y", "psi"], ["Y", "Psi"], ["o", "omega"], ["O", "Omega"],
];

const SNIPPETS: Snippet[] = [
  ...GREEK.map(([k, n]) => sn("@" + k, `\\${n}`)),
  sn(":e", "\\varepsilon"), sn(":f", "\\varphi"),
  sn("<=>", "\\iff "), sn("=>", "\\implies "), sn("=<", "\\impliedby "), sn("->", "\\to "), sn("<-", "\\gets "),
  sn("!=", "\\neq "), sn(">=", "\\geq "), sn("<=", "\\leq "), sn("~=", "\\approx "), sn("+-", "\\pm "), sn("-+", "\\mp "),
  sn("xx", "\\times ", true), sn("**", "\\cdot "), sn("...", "\\ldots "), sn("inf", "\\infty ", true),
  sn("AA", "\\forall ", true), sn("EE", "\\exists ", true),
  sn("NN", "\\mathbb{N}", true), sn("ZZ", "\\mathbb{Z}", true), sn("QQ", "\\mathbb{Q}", true), sn("RR", "\\mathbb{R}", true), sn("CC", "\\mathbb{C}", true),
  sn("//", "\\frac{$0}{}"), sn("sq", "\\sqrt{$0}", true), sn("ee", "e^{$0}", true), sn("td", "^{$0}"), sn("rd", "^{($0)}"),
  sn("__", "_{$0}"), sn("sr", "^{2}"), sn("cb", "^{3}"),
  sn("sum", "\\sum_{$0}^{}", true), sn("prod", "\\prod_{$0}^{}", true), sn("lim", "\\lim_{$0 \\to }", true), sn("int", "\\int ", true), sn("dint", "\\int_{$0}^{}", true),
  sn("part", "\\frac{\\partial $0}{\\partial }", true), sn("pmat", "\\begin{pmatrix} $0 \\end{pmatrix}", true), sn("bmat", "\\begin{bmatrix} $0 \\end{bmatrix}", true),
  sn("cases", "\\begin{cases} $0 \\end{cases}", true),
  ...["arcsin", "arccos", "arctan", "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "det"].map((f) => sn(f, `\\${f} `, true)),
].sort((a, b) => b.t.length - a.t.length);

const POSTFIX = /(\\[A-Za-z]+|[A-Za-z0-9])(hat|bar|vec|dot|tilde)$/;
const OPERAND = /((?:\\[A-Za-z]+|[A-Za-z0-9.]+)(?:[_^](?:\{[^{}]*\}|[A-Za-z0-9]))*)$/;
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/** Vloží náhradu, odstraní `back` znaků před kurzorem a umístí kurzor na značku $0. */
function replace(view: EditorView, from: number, back: number, to: number, text: string) {
  const idx = text.indexOf("$0");
  const clean = text.replace("$0", "");
  const tr = view.state.tr.insertText(clean, from - back, to);
  tr.setSelection(TextSelection.create(tr.doc, from - back + (idx >= 0 ? idx : clean.length)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function context(view: EditorView, from: number) {
  const $from = view.state.doc.resolve(from);
  const block = $from.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const text = blockText(block);
  return { text, idx: from - $from.start(), start: $from.start() };
}

function onTextInput(view: EditorView, from: number, to: number, typed: string) {
  if (from !== to || typed.length !== 1) return false;
  const ctx = context(view, from);
  if (!ctx) return false;
  const { text, idx } = ctx;
  const before = text.slice(0, idx);

  if (!inMathAt(text, idx)) {
    // mimo vzorec: jen mk (řádkový) a dm (samostatný, na začátku řádku)
    if (typed === "k" && before.endsWith("m") && (before.length === 1 || /[\s(]/.test(before.slice(-2, -1)))) return replace(view, from, 1, to, "$$0$");
    if (typed === "m" && before === "d") return replace(view, from, 1, to, "$$ $0 $$");
    return false;
  }

  // zavírací závorka přeskočí už vloženou
  if ((typed === ")" || typed === "]" || typed === "}") && text[idx] === typed) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1)));
    return true;
  }
  // automatické závorky
  if (PAIRS[typed]) return replace(view, from, 0, to, typed + "$0" + PAIRS[typed]);

  const combined = before + typed;

  // zlomek z předchozího členu: a/ → \frac{a}{}
  if (typed === "/" && !before.endsWith("/")) {
    if (before.endsWith(")")) {
      let depth = 0;
      for (let i = before.length - 1; i >= 0; i--) {
        if (before[i] === ")") depth++;
        else if (before[i] === "(" && --depth === 0) return replace(view, from, before.length - i, to, `\\frac{${before.slice(i + 1, -1)}}{$0}`);
      }
    } else {
      const m = OPERAND.exec(before);
      if (m) return replace(view, from, m[1].length, to, `\\frac{${m[1]}}{$0}`);
    }
  }

  // x + hat → \hat{x}
  const post = POSTFIX.exec(combined);
  if (post && typed === post[2].slice(-1)) return replace(view, from, post[0].length - 1, to, `\\${post[2]}{${post[1]}}`);

  for (const s of SNIPPETS) {
    if (!combined.endsWith(s.t)) continue;
    const prev = combined[combined.length - s.t.length - 1] ?? "";
    if (s.word && /[A-Za-z\\]/.test(prev)) continue;
    return replace(view, from, s.t.length - 1, to, s.r);
  }
  return false;
}

function onKeyDown(view: EditorView, e: KeyboardEvent) {
  const { from, to } = view.state.selection;
  if (from !== to || e.metaKey || e.ctrlKey || e.altKey) return false;
  // Backspace a Delete vedle vykresleného vzorce smažou celý vzorec (skrytý zdrojový text by se jinak ubíral po znacích, bez viditelné změny)
  if ((e.key === "Backspace" || e.key === "Delete") && !e.shiftKey) {
    const $p = view.state.doc.resolve(from);
    if ($p.parent.isTextblock && !$p.parent.type.spec.code) {
      const r = mathRanges($p.parent, $p.start()).find((m) => !m.display && (e.key === "Backspace" ? m.to === from : m.from === from));
      if (r) {
        view.dispatch(view.state.tr.delete(r.from, r.to).scrollIntoView());
        return true;
      }
    }
  }
  // šipka nahoru/dolů do odstavce tvořeného samostatným vzorcem: prohlížeč by vykreslený vzorec (blok bez textu) přeskočil, kurzor vstoupí do zdroje
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey && view.endOfTextblock(e.key === "ArrowDown" ? "down" : "up")) {
    const $p = view.state.doc.resolve(from);
    const down = e.key === "ArrowDown";
    const idx = $p.index(-1) + (down ? 1 : -1);
    const parent = $p.node(-1);
    const next = idx >= 0 && idx < parent.childCount ? parent.child(idx) : null;
    if (next?.isTextblock && !next.type.spec.code) {
      const start = down ? $p.after() + 1 : $p.before() - next.nodeSize + 1;
      const rs = mathRanges(next, start);
      const r = down ? rs[0] : rs[rs.length - 1];
      if (r?.display && (down ? r.from === start : r.to === start + next.content.size)) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, down ? r.from + r.delim : r.to - r.delim)).scrollIntoView());
        return true;
      }
    }
  }
  // šipka do vykresleného vzorce: kurzor vstoupí do zdrojového kódu (skrytý text by jinak kurzor přeskočil)
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey) {
    const $p = view.state.doc.resolve(from);
    if ($p.parent.isTextblock && !$p.parent.type.spec.code) {
      const r = mathRanges($p.parent, $p.start()).find((m) => !m.display && (e.key === "ArrowLeft" ? m.to === from : m.from === from));
      if (r) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, e.key === "ArrowLeft" ? r.to - 1 : r.from + 1)));
        return true;
      }
    }
  }
  // Tab za „=“ vloží navržený výsledek
  if (e.key === "Tab" && !e.shiftKey && view.editable) {
    const sug = suggestionAt(view.state);
    if (sug) {
      const { res } = sug;
      const tr = res.approx ? view.state.tr.insertText(`\\approx ${res.text}`, from - 1, from) : view.state.tr.insertText(res.text, from, from);
      tr.setSelection(TextSelection.create(tr.doc, (res.approx ? from - 1 + `\\approx ${res.text}`.length : from + res.text.length)));
      view.dispatch(tr.scrollIntoView());
      return true;
    }
  }
  const ctx = context(view, from);
  if (!ctx || !inMathAt(ctx.text, ctx.idx)) return false;
  const { text, idx } = ctx;

  if (e.key === "Tab" && !e.shiftKey) {
    const m = /[)\]}$]/.exec(text.slice(idx));
    if (!m) return false;
    let jump = idx + m.index + 1;
    if (m[0] === "$" && text[jump] === "$") jump++;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, ctx.start + jump)));
    return true;
  }
  if (e.key === "Backspace" && PAIRS[text[idx - 1]] === text[idx]) {
    view.dispatch(view.state.tr.delete(from - 1, from + 1));
    return true;
  }
  return false;
}

/* ---------- vykreslení ---------- */

function widget(view: EditorView, getPos: () => number | undefined, r: Range) {
  const el = document.createElement("span");
  el.className = `math-widget${r.display ? " display" : ""}`;
  el.contentEditable = "false";
  el.title = "Klikni pro úpravu";
  el.innerHTML = katex.renderToString(r.latex, { throwOnError: false, displayMode: r.display, strict: "ignore", trust: false, output: "htmlAndMathml", macros: { ...MACROS } });
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const pos = getPos();
    if (pos == null) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + (r.to - r.from) - r.delim)));
    view.focus();
  });
  return el;
}

function anchor() {
  const el = document.createElement("span");
  el.className = "math-anchor";
  el.contentEditable = "false";
  el.setAttribute("aria-hidden", "true");
  return el;
}

const key = new PluginKey("latexSuite");

export const LatexSuite = Extension.create({
  name: "latexSuite",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key,
        props: {
          handleTextInput: onTextInput,
          handleKeyDown: onKeyDown,
          decorations(state) {
            const { from, to } = state.selection;
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if (!node.type.spec.code) {
                for (const r of mathRanges(node, pos + 1)) {
                  // samostatný vzorec je blok: kurzor vedle něj nemá kam sednout, proto se zdroj ukáže už při dotyku
                  if (r.display ? from <= r.to && to >= r.from : from < r.to && to > r.from) decos.push(Decoration.inline(r.from, r.to, { class: "math-src" }));
                  else {
                    decos.push(Decoration.inline(r.from, r.to, { class: "math-hidden" }));
                    decos.push(Decoration.widget(r.from, (view, getPos) => widget(view, getPos, r), { side: 1, key: `m${r.from}:${r.display}:${r.latex}` }));
                    // kotva za skrytým zdrojem: DOM kurzor za vzorcem by jinak skončil uvnitř skrytého textu (display: none) a nebyl by vidět
                    if (!r.display) decos.push(Decoration.widget(r.to, anchor, { side: -1, key: `a${r.to}` }));
                  }
                }
              }
              return false;
            });
            if (editor.isEditable) {
              const sug = suggestionAt(state);
              if (sug) decos.push(Decoration.widget(from, () => suggestWidget(sug.res), { side: 1, key: `s${from}:${sug.res.text}:${sug.res.approx}` }));
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
