/**
 * Dotaz na vlastní AI studenta: místo odpovědi z naší aplikace (limity) se otevře zvolená AI s předvyplněnou zprávou v adrese (?q=).
 * Zpráva nese kontext sady (test, souhrn, kartičky). Adresy mají limit délky, proto se kontext podle potřeby zkracuje.
 */
export type Provider = { id: string; name: string; url: string; /** bez předvyplnění přes adresu: zpráva se jen zkopíruje do schránky */ copyOnly?: boolean };

export const PROVIDERS: Provider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/?q=" },
  { id: "claude", name: "Claude", url: "https://claude.ai/new?q=" },
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai/search?q=" },
  { id: "copilot", name: "Copilot", url: "https://copilot.microsoft.com/?q=" },
  { id: "grok", name: "Grok", url: "https://grok.com/?q=" },
  { id: "mistral", name: "Le Chat (Mistral)", url: "https://chat.mistral.ai/chat?q=" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", copyOnly: true },
];

/** Nejvíc znaků zakódované zprávy v adrese (servery před AI často berou adresy do ~16 kB). */
const URL_BUDGET = 12_000;

export type ChatContext = { subject: string; testLine: string; summary: string; cards: { q: string; a: string }[] };

const enc = (s: string) => encodeURIComponent(s);

const clip = (s: string, encodedBudget: number) => {
  if (encodedBudget <= 0) return "";
  if (enc(s).length <= encodedBudget) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc(s.slice(0, mid)).length <= encodedBudget) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + "…";
};

/** Sestaví zprávu. Otázka a pokyny jsou vždy celé, souhrn a kartičky se zkrátí podle místa. `full` je celá zpráva bez zkrácení (do schránky). */
export function buildPrompt(question: string, c: ChatContext): { text: string; full: string; trimmed: boolean } {
  const head = `Jsem student střední školy a učím se na test nebo zkoušení z předmětu ${c.subject} (${c.testLine}). Pomoz mi s látkou. Odpovídej česky, srozumitelně a vycházej z podkladů níže; když si nejsi jistý, řekni to.`;
  const tail = `\n\nMoje otázka: ${question.trim()}`;
  const summaryBlock = (s: string) => `\n\n--- SOUHRN LÁTKY ---\n${s}`;
  const cards = c.cards.map((k) => `Otázka: ${k.q}\nOdpověď: ${k.a}`).join("\n\n");
  const cardsBlock = (s: string) => `\n\n--- KARTIČKY ---\n${s}`;

  const full = head + (c.summary ? summaryBlock(c.summary) : "") + (cards ? cardsBlock(cards) : "") + tail;
  if (enc(full).length <= URL_BUDGET) return { text: full, full, trimmed: false };

  let left = URL_BUDGET - enc(head + tail).length - enc(summaryBlock("")).length - enc(cardsBlock("")).length;
  const summary = clip(c.summary, Math.floor(left * 0.7));
  left -= enc(summary).length;
  const cardsText = clip(cards, left);
  const text = head + (summary ? summaryBlock(summary) : "") + (cardsText ? cardsBlock(cardsText) : "") + tail;
  return { text, full, trimmed: true };
}

export const chatUrl = (p: Provider, text: string) => (p.copyOnly ? p.url : p.url + enc(text));
