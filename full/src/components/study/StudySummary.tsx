import { Rich } from "./Rich";

type Section = { title: string; blocks: { kind: "p" | "ul"; items: string[] }[] };

/** Souhrn od modelu: „## “ nadpisy dělí na oddíly, „- “ jsou odrážky, ostatní řádky odstavce. Nic jiného se nevykresluje. */
function parse(text: string): Section[] {
  const out: Section[] = [{ title: "", blocks: [] }];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const sec = out[out.length - 1];
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) {
      out.push({ title: h[1].replace(/\*\*/g, ""), blocks: [] });
      continue;
    }
    const li = /^[-*•]\s+(.*)$/.exec(line);
    const last = sec.blocks[sec.blocks.length - 1];
    if (li) {
      if (last?.kind === "ul") last.items.push(li[1]);
      else sec.blocks.push({ kind: "ul", items: [li[1]] });
    } else sec.blocks.push({ kind: "p", items: [line] });
  }
  return out.filter((s) => s.title || s.blocks.length);
}

export function StudySummary({ text }: { text: string }) {
  const sections = parse(text);
  return (
    <div className="study-sections">
      {sections.map((s, i) => (
        <section key={i} className={`card study-section${/pozor|chyb/i.test(s.title) ? " warn" : ""}`}>
          {s.title && <h3><Rich text={s.title} /></h3>}
          {s.blocks.map((b, k) =>
            b.kind === "ul" ? (
              <ul key={k}>{b.items.map((it, j) => <li key={j}><Rich text={it} /></li>)}</ul>
            ) : (
              <p key={k}><Rich text={b.items[0]} /></p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}
