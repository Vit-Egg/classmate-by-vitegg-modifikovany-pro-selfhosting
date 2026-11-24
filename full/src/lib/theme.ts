import { sunIsUp } from "./sun";

/** auto = podle zařízení, sun = světlý přes den a tmavý po západu slunce */
export type ThemeMode = "auto" | "light" | "dark" | "sun";

export function applyTheme(mode: ThemeMode) {
  try {
    localStorage.setItem("theme", mode); // „auto“ se ukládá výslovně, protože bez volby platí výchozí „podle slunce“
  } catch {}
  if (mode === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = mode === "sun" ? (sunIsUp(Date.now()) ? "light" : "dark") : mode;
  window.dispatchEvent(new CustomEvent("classmate:theme", { detail: mode }));
}

/** Barevné motivy. Výchozí („mint“) je v globals.css a nemá žádný atribut. [světlý: barva, text na ní, jemné pozadí] / [tmavý: …] */
export type Accent = { id: string; name: string; light: [string, string, string]; dark: [string, string, string] };

export const ACCENTS: Accent[] = [
  { id: "mint", name: "Máta", light: ["#0e7c56", "#ffffff", "#dcf2e8"], dark: ["#4ae0a0", "#04251a", "#123b2d"] },
  { id: "blue", name: "Modrá", light: ["#1d63d6", "#ffffff", "#dce8fb"], dark: ["#6aa9ff", "#04162e", "#14284a"] },
  { id: "cyan", name: "Azurová", light: ["#0b7f8c", "#ffffff", "#d6eef1"], dark: ["#4cd3e0", "#02262b", "#123238"] },
  { id: "violet", name: "Fialová", light: ["#6d3fd1", "#ffffff", "#e8dffa"], dark: ["#b794ff", "#1a0b36", "#2a1d4d"] },
  { id: "pink", name: "Růžová", light: ["#c2307a", "#ffffff", "#fadcea"], dark: ["#ff8fc3", "#3a0720", "#3f1730"] },
  { id: "red", name: "Červená", light: ["#c93a2d", "#ffffff", "#fadcd9"], dark: ["#ff7a70", "#330806", "#3f1b19"] },
  { id: "orange", name: "Oranžová", light: ["#c2570a", "#ffffff", "#fbe4d0"], dark: ["#ffa04d", "#2e1500", "#3d2610"] },
  { id: "yellow", name: "Žlutá", light: ["#8f6d00", "#ffffff", "#f6ecc8"], dark: ["#f2cc3c", "#2b2100", "#3a3012"] },
  { id: "graphite", name: "Grafit", light: ["#3a3f47", "#ffffff", "#e4e6ea"], dark: ["#d4d7dd", "#15171a", "#2a2d33"] },
];

/** CSS pro všechny motivy – jediný zdroj pravdy pro stránku i náhledy v nastavení. */
export const accentCss = () =>
  ACCENTS.filter((a) => a.id !== "mint")
    .map((a) => `:root[data-accent="${a.id}"]{--accent:light-dark(${a.light[0]},${a.dark[0]});--accent-ink:light-dark(${a.light[1]},${a.dark[1]});--accent-soft:light-dark(${a.light[2]},${a.dark[2]})}`)
    .join("");

export function applyAccent(id: string) {
  try {
    if (id === "mint") localStorage.removeItem("accent");
    else localStorage.setItem("accent", id);
  } catch {}
  if (id === "mint") document.documentElement.removeAttribute("data-accent");
  else document.documentElement.dataset.accent = id;
  window.dispatchEvent(new CustomEvent("classmate:accent", { detail: id }));
}
