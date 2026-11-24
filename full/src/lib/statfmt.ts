/** Formátování čísel ve statistikách (bez závislostí na serveru, používá se i v prohlížeči). */
export const num = (v: number) => Math.round(v).toLocaleString("cs-CZ");
export const dec = (v: number, d = 1) => v.toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (a: number, b: number) => (b ? `${dec((a / b) * 100, a / b >= 0.1 ? 0 : 1)} %` : "–");
export const bytes = (b: number) => (b >= 1024 ** 3 ? `${dec(b / 1024 ** 3)} GB` : b >= 1024 ** 2 ? `${dec(b / 1024 ** 2)} MB` : `${Math.round(b / 1024)} kB`);
export const czk = (v: number) => `${num(v)} Kč`;
export const dur = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
export const hours = (sec: number) => `${dec(sec / 3600)} h`;
