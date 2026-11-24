/** Verze aplikace z gitu (viz next.config.ts). Hodnota se vloží při buildu, takže odpovídá běžícímu kódu. */
type Build = { n: number; sha: string; date: string };
const build = (): Build => {
  try {
    return JSON.parse(process.env.APP_BUILD ?? "{}");
  } catch {
    return { n: 0, sha: "", date: "" };
  }
};

/** Čas spuštění serveru (pro správce: je vidět, že se po aktualizaci opravdu restartoval). */
export const STARTED = Date.now();

/** Krátce, např. „v67“; prázdné u sestavení bez gitu. */
export const versionLabel = () => (build().n ? `v${build().n}` : "");

/** Podrobně, např. „verze 67 · 094f722 · 24. 10. 2026“. */
export function versionTitle(prefix = true) {
  const b = build();
  if (!b.n) return "verze neznámá";
  const d = b.date ? new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(b.date)) : "";
  return [prefix ? "verze " + b.n : String(b.n), b.sha, d].filter(Boolean).join(" · ");
}
