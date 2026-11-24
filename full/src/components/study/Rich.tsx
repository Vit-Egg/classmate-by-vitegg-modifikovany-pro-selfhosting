"use client";

import katex from "katex";
import { MACROS } from "@/lib/katex-macros";
import "katex/dist/katex.min.css";

const MATH = /(\$\$[^$]+\$\$|\$[^$\n]+\$)/g;

function math(src: string, display: boolean) {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "html", macros: { ...MACROS } });
  } catch {
    return null;
  }
}

/** Text od modelu: **tučné** a vzorce v $…$ / $$…$$ (KaTeX). Nic jiného se nevykresluje, takže odpověď nemůže vložit značky. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(MATH).map((part, i) => {
        if (i % 2) {
          const display = part.startsWith("$$");
          const html = math(part.slice(display ? 2 : 1, display ? -2 : -1).trim(), display);
          if (html) return <span key={i} className={display ? "study-math-block" : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return part.split(/\*\*(.+?)\*\*/g).map((p, j) => (j % 2 ? <strong key={`${i}-${j}`}>{p}</strong> : p));
      })}
    </>
  );
}
