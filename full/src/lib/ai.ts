/**
 * Společné volání Google Gemini pro celou aplikaci. Modely a klíče se berou z nastavení ve Správě (ai-config):
 * zkouší se model po modelu a u každého všechny klíče; kdo selže, přeskočí se na další.
 */
import { getAiConfig, hasAiKeys } from "./ai-config";
import { countUsage } from "./db";

export const aiEnabled = () => hasAiKeys();

type Request = { system: string; user: string; temperature?: number; maxTokens?: number; json?: boolean; timeoutMs?: number };

async function call(model: string, key: string, r: Request): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: "user", parts: [{ text: r.user }] }],
      generationConfig: { temperature: r.temperature ?? 0.4, maxOutputTokens: r.maxTokens ?? 1500, ...(r.json ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: AbortSignal.timeout(r.timeoutMs ?? 45_000),
  });
  if (!res.ok) throw Object.assign(new Error(`Gemini ${model}: HTTP ${res.status}`), { status: res.status });
  const j = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error(`Gemini ${model}: prázdná odpověď`);
  if (r.json && c?.finishReason === "MAX_TOKENS") throw new Error(`Gemini ${model}: odpověď se nevešla do limitu`);
  return text;
}

/** Krátká pauza pro klíč (neplatný) nebo dvojici klíč + model (vyčerpaný limit), ať se zbytečně neztrácí čas opakovanými pokusy. */
const cooldown = new Map<string, number>();
const cooling = (k: string) => (cooldown.get(k) ?? 0) > Date.now();

/** Souběžně běží nejvýš 6 dotazů na AI (AI_CONCURRENCY); další čekají nejvýš 25 s. Při náporu tak nevznikají stovky pomalých spojení a zbytečně se nevyčerpávají limity klíčů. */
const maxAi = Math.max(1, Number(process.env.AI_CONCURRENCY) || 6);
let aiBusy = 0;
const aiQueue: (() => void)[] = [];
async function aiSlot() {
  if (aiBusy < maxAi) {
    aiBusy++;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const turn = () => (clearTimeout(t), resolve());
    const t = setTimeout(() => {
      const i = aiQueue.indexOf(turn);
      if (i >= 0) aiQueue.splice(i, 1);
      reject(new Error("AI je teď přetížená."));
    }, 25_000);
    aiQueue.push(turn);
  });
}
const aiFree = () => {
  const next = aiQueue.shift();
  if (next) next();
  else aiBusy--;
};

export async function generateText(r: Request, log = "ai"): Promise<{ text: string; model: string }> {
  await aiSlot();
  try {
    const out = await generateTextNow(r, log);
    countUsage(`ai:${log}`);
    return out;
  } catch (e) {
    countUsage(`ai:${log}:chyba`);
    throw e;
  } finally {
    aiFree();
  }
}

async function generateTextNow(r: Request, log: string): Promise<{ text: string; model: string }> {
  const { models: list, keys } = getAiConfig();
  let last: unknown = new Error("Není nastavený žádný klíč.");
  for (const { name: model } of list) {
    for (const k of keys) {
      if (cooling(k.id) || cooling(`${k.id}:${model}`)) continue;
      try {
        return { text: await call(model, k.key, r), model };
      } catch (e) {
        last = e;
        const status = (e as { status?: number }).status;
        if (status === 400 || status === 401 || status === 403) cooldown.set(k.id, Date.now() + 10 * 60_000);
        else if (status === 429) cooldown.set(`${k.id}:${model}`, Date.now() + 90_000);
        console.error(`[${log}] klíč …${k.last4}:`, (e as Error).message);
      }
    }
  }
  throw last;
}
