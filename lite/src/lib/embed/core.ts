/**
 * Widgety pro nový Classmate (formát pluginu `classmate-plugin/1`) a pro jakýkoli jiný dashboard.
 * Tento soubor je stejný v plné i odlehčené verzi (full/ a lite/): klíč, hlavičky, manifest a vykreslení HTML.
 *
 * - Přístup jen přes tajný klíč v adrese (`?k=…`), cookies v cizím iframe Safari blokuje. Klíč otevře jen embedy a manifest, nic jiného.
 * - Vložit widget smí jen tento server a domény z `EMBED_ORIGINS` (hlavička `frame-ancestors`).
 * - Embed stránky jsou čisté HTML bez JavaScriptu, čtou jen data, která server už má (nevolají kvůli nim Bakaláře ani Strava.cz).
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

/* ---------- klíč ---------- */

const keyFile = () => {
  const dir = path.resolve(process.env.DATA_DIR ?? "./data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, ".embed-key");
};

export function embedKey(): string {
  const f = keyFile();
  try {
    const k = fs.readFileSync(f, "utf8").trim();
    if (k.length >= 24) return k;
  } catch {}
  return rotateEmbedKey();
}

/** Nový klíč: všechny dříve zkopírované adresy widgetů, manifestu a kalendáře přestanou platit. */
export function rotateEmbedKey(): string {
  const k = randomBytes(24).toString("base64url");
  fs.writeFileSync(keyFile(), k, { mode: 0o600 });
  return k;
}

export function keyOk(given: string | null | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(embedKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- povolené domény ---------- */

/** Domény, které smí widgety vložit, z `EMBED_ORIGINS` (čárkou oddělené, např. `https://classmate.cz,https://muj-dashboard.cz`). */
export function embedOrigins(): string[] {
  return (process.env.EMBED_ORIGINS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

export function publicBase(): string {
  return (process.env.PUBLIC_URL ?? "").trim().replace(/\/+$/, "") || "http://localhost:3000";
}

/* ---------- odpovědi ---------- */

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function embedHeaders(extra: Record<string, string> = {}): Headers {
  const origins = embedOrigins();
  const h = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'${origins.length ? " " + origins.join(" ") : ""}`,
    ...extra,
  });
  return h;
}

/** CORS pro manifest: jen povolené domény (manifest stahuje prohlížeč na stránce Classmate). */
export function corsHeaders(reqOrigin: string | null): Record<string, string> {
  const o = reqOrigin?.replace(/\/+$/, "");
  if (!o || !embedOrigins().includes(o)) return {};
  return { "Access-Control-Allow-Origin": o, Vary: "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS" };
}

export const forbidden = () => new Response("Neplatný nebo chybějící klíč.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/* ---------- data widgetů ---------- */

export type ELesson = { hour: number; subject: string; begin: string; end: string; room?: string; teacher?: string; cancelled?: boolean; change?: string | null };
export type EDay = { date: string; lessons: ELesson[]; note?: string };
export type EMark = { subject: string; value: string; caption?: string; weight?: number | null; date: string; isNew?: boolean };
export type EAverage = { subject: string; average: string; marks: number };
export type EAbsence = { total: number; excused: number; unsolved: number; missed: number; late: number; threshold: number; subjects: { name: string; lessons: number; missed: number }[] };
export type EKomens = { title: string; sender: string; date: string; read: boolean };
export type ELunch = { date: string; meals: { kind: string; name: string; ordered: boolean }[] };
export type ETask = { title: string; subject?: string; due?: string | null };
export type ETest = { subject: string; topic?: string; date: string };

export type WidgetDef = { id: string; title: string; height: number; icon?: string };

export const ALL_WIDGETS: WidgetDef[] = [
  { id: "rozvrh", title: "Rozvrh", height: 320 },
  { id: "suplovani", title: "Suplování", height: 200 },
  { id: "znamky", title: "Poslední známky", height: 280 },
  { id: "prumery", title: "Průměry", height: 320 },
  { id: "absence", title: "Absence", height: 240 },
  { id: "komens", title: "Komens", height: 260 },
  { id: "obedy", title: "Obědy", height: 260 },
  { id: "ukoly", title: "Úkoly", height: 240 },
  { id: "testy", title: "Testy a zkoušení", height: 240 },
];

/* ---------- manifest ---------- */

export function manifest(opts: { name: string; description: string; widgets: string[]; pages?: { id: string; title: string; path: string; icon: string }[] }) {
  const base = publicBase();
  const k = encodeURIComponent(embedKey());
  const url = (id: string) => `${base}/embed/${id}?k=${k}`;
  const widgets = ALL_WIDGETS.filter((w) => opts.widgets.includes(w.id)).map((w) => ({ id: w.id, title: w.title, url: url(w.id), height: w.height }));
  const has = (id: string) => widgets.some((w) => w.id === id);
  // „Klasický Classmate“: rozvrh nahoře, pod ním suplování, známky a průměry, absence, Komens, obědy (jako nástěnka původního Classmate)
  const classic = [
    ["rozvrh", "l"], ["suplovani", "r"], ["ukoly", "r"], ["testy", "r"], ["znamky", "l"], ["prumery", "r"], ["absence", "l"], ["komens", "r"], ["obedy", "l"],
  ].filter(([id]) => has(id)).map(([widget, col]) => ({ widget, col }));
  const school = [["rozvrh", "l"], ["suplovani", "r"], ["obedy", "r"]].filter(([id]) => has(id)).map(([widget, col]) => ({ widget, col }));
  return {
    format: "classmate-plugin/1",
    name: opts.name.slice(0, 60),
    description: opts.description.slice(0, 300),
    homepage: base,
    widgets,
    pages: (opts.pages ?? []).map((p) => ({ id: p.id, title: p.title, url: `${base}${p.path}?k=${k}`, icon: p.icon })),
    layouts: [
      { id: "klasicky", title: "Klasický Classmate", widgets: classic },
      { id: "den", title: "Jen dnešní den", widgets: school },
    ],
  };
}

/* ---------- HTML ---------- */

const DAYS = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];
const dow = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
export const fmtDay = (iso: string, today?: string) => {
  const d = `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
  if (today && iso === today) return `Dnes · ${d}`;
  return `${DAYS[dow(iso)][0].toUpperCase()}${DAYS[dow(iso)].slice(1)} ${d}`;
};

export type Theme = "light" | "dark" | "auto";
export const themeOf = (v: string | null): Theme => (v === "light" || v === "dark" ? v : "auto");

function page(title: string, body: string, theme: Theme, transparent: boolean) {
  const light = "--bg:#ffffff;--fg:#1d1d1f;--mut:#6e6e73;--line:#e5e5ea;--acc:#2f6fed;--bad:#d93025;--warn:#b26b00;--ok:#1e8e3e;--chip:#f2f2f7";
  const dark = "--bg:#1c1c1e;--fg:#f2f2f7;--mut:#a1a1a6;--line:#2c2c2e;--acc:#6ea0ff;--bad:#ff6b5e;--warn:#ffb340;--ok:#4cd07d;--chip:#2c2c2e";
  const vars = theme === "light" ? `:root{${light}}` : theme === "dark" ? `:root{${dark}}` : `:root{${light}}@media (prefers-color-scheme:dark){:root{${dark}}}`;
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="300"><title>${esc(title)}</title><style>
${vars}
*{box-sizing:border-box}html,body{margin:0;background:${transparent ? "transparent" : "var(--bg)"};color:var(--fg);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.w{padding:12px 14px}h1{font-size:13px;font-weight:600;color:var(--mut);margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em}
.r{display:flex;gap:10px;align-items:baseline;padding:6px 0;border-top:1px solid var(--line)}.r:first-of-type{border-top:0}
.n{width:22px;color:var(--mut);font-variant-numeric:tabular-nums;flex:none}.t{flex:1;min-width:0}.t b{font-weight:600}.s{color:var(--mut);font-size:12px}
.e{color:var(--mut);padding:8px 0}.x{text-decoration:line-through;color:var(--mut)}.c{color:var(--warn);font-size:12px}
.v{font-weight:700;font-size:17px;min-width:28px;text-align:center;flex:none}.chip{background:var(--chip);border-radius:6px;padding:1px 6px;font-size:12px}
.new{color:var(--acc);font-size:11px;font-weight:700}.bad{color:var(--bad)}.ok{color:var(--ok)}.day{font-weight:600;margin:10px 0 2px}.day:first-of-type{margin-top:0}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}.k{background:var(--chip);border-radius:10px;padding:8px 10px}.k b{display:block;font-size:20px}
.bar{height:5px;background:var(--chip);border-radius:3px;overflow:hidden;margin-top:3px}.bar i{display:block;height:100%;background:var(--acc)}
</style></head><body><div class="w">${body}</div></body></html>`;
}

const empty = (t: string) => `<div class="e">${esc(t)}</div>`;

function lessonRow(l: ELesson) {
  const meta = [l.begin && `${l.begin}–${l.end}`, l.room, l.teacher].filter(Boolean).join(" · ");
  return `<div class="r"><span class="n">${l.hour}</span><span class="t"><b class="${l.cancelled ? "x" : ""}">${esc(l.subject || "—")}</b>${l.change ? ` <span class="c">${esc(l.change)}</span>` : ""}<br><span class="s">${esc(meta)}</span></span></div>`;
}

export type RenderInput =
  | { id: "rozvrh"; days: EDay[]; today: string }
  | { id: "suplovani"; days: EDay[]; today: string }
  | { id: "znamky"; marks: EMark[] }
  | { id: "prumery"; averages: EAverage[] }
  | { id: "absence"; absence: EAbsence | null }
  | { id: "komens"; messages: EKomens[] }
  | { id: "obedy"; lunch: ELunch[] | null; today: string }
  | { id: "ukoly"; tasks: ETask[]; today: string }
  | { id: "testy"; tests: ETest[]; today: string };

export function renderWidget(input: RenderInput, theme: Theme = "auto", transparent = false): string {
  const title = ALL_WIDGETS.find((w) => w.id === input.id)?.title ?? input.id;
  let body = `<h1>${esc(title)}</h1>`;
  switch (input.id) {
    case "rozvrh": {
      const days = input.days.filter((d) => d.lessons.length || d.note);
      body += days.length
        ? days.slice(0, 2).map((d) => `<div class="day">${esc(fmtDay(d.date, input.today))}${d.note ? ` <span class="s">${esc(d.note)}</span>` : ""}</div>${d.lessons.map(lessonRow).join("")}`).join("")
        : empty("Rozvrh zatím není načtený.");
      break;
    }
    case "suplovani": {
      const rows = input.days.flatMap((d) => d.lessons.filter((l) => l.change || l.cancelled).map((l) => ({ d, l })));
      body += rows.length
        ? rows.slice(0, 12).map(({ d, l }) => `<div class="r"><span class="n">${l.hour}</span><span class="t"><b class="${l.cancelled ? "x" : ""}">${esc(l.subject || "—")}</b> <span class="c">${esc(l.change ?? "odpadá")}</span><br><span class="s">${esc(fmtDay(d.date, input.today))}</span></span></div>`).join("")
        : empty("Žádné změny v rozvrhu.");
      break;
    }
    case "znamky":
      body += input.marks.length
        ? input.marks.slice(0, 10).map((m) => `<div class="r"><span class="v">${esc(m.value)}</span><span class="t"><b>${esc(m.subject)}</b>${m.isNew ? ' <span class="new">NOVÁ</span>' : ""}<br><span class="s">${esc([m.caption, m.weight ? `váha ${m.weight}` : "", fmtDay(m.date)].filter(Boolean).join(" · "))}</span></span></div>`).join("")
        : empty("Zatím žádné známky.");
      break;
    case "prumery":
      body += input.averages.length
        ? input.averages.map((a) => `<div class="r"><span class="t"><b>${esc(a.subject)}</b> <span class="s">${a.marks}×</span></span><span class="v ${Number(a.average.replace(",", ".")) >= 3.5 ? "bad" : ""}">${esc(a.average || "–")}</span></div>`).join("")
        : empty("Zatím žádné průměry.");
      break;
    case "absence": {
      const a = input.absence;
      if (!a) {
        body += empty("Absence zatím není načtená.");
        break;
      }
      body += `<div class="g"><div class="k"><b>${a.total}</b><span class="s">celkem hodin</span></div><div class="k"><b class="ok">${a.excused}</b><span class="s">omluveno</span></div><div class="k"><b>${a.unsolved}</b><span class="s">nevyřízeno</span></div><div class="k"><b class="${a.missed ? "bad" : ""}">${a.missed}</b><span class="s">neomluveno</span></div></div>`;
      const top = a.subjects.filter((s) => s.lessons > 0 && s.missed > 0).map((s) => ({ ...s, p: s.missed / s.lessons })).sort((x, y) => y.p - x.p).slice(0, 5);
      body += top.map((s) => `<div class="r"><span class="t"><b>${esc(s.name)}</b> <span class="s">${s.missed}/${s.lessons} h</span><div class="bar"><i style="width:${Math.min(100, Math.round((s.p / Math.max(a.threshold, 0.01)) * 100))}%;${s.p >= a.threshold ? "background:var(--bad)" : ""}"></i></div></span><span class="s ${s.p >= a.threshold ? "bad" : ""}">${Math.round(s.p * 100)} %</span></div>`).join("");
      break;
    }
    case "komens":
      body += input.messages.length
        ? input.messages.slice(0, 8).map((m) => `<div class="r"><span class="t"><b>${esc(m.title || "(bez předmětu)")}</b>${m.read ? "" : ' <span class="new">NEPŘEČTENO</span>'}<br><span class="s">${esc(m.sender)} · ${esc(fmtDay(m.date.slice(0, 10)))}</span></span></div>`).join("")
        : empty("Žádné zprávy.");
      break;
    case "obedy":
      body += input.lunch == null
        ? empty("Strava.cz není propojená.")
        : input.lunch.length
          ? input.lunch.slice(0, 3).map((d) => `<div class="day">${esc(fmtDay(d.date, input.today))}</div>${d.meals.map((m) => `<div class="r"><span class="t"><span class="chip">${esc(m.kind)}</span> ${m.ordered ? "<b>" : ""}${esc(m.name)}${m.ordered ? "</b> <span class=\"ok s\">objednáno</span>" : ""}</span></div>`).join("")}`).join("")
          : empty("Na příští dny není jídelníček.");
      break;
    case "ukoly":
      body += input.tasks.length
        ? input.tasks.slice(0, 10).map((t) => `<div class="r"><span class="t"><b>${esc(t.title)}</b><br><span class="s">${esc([t.subject, t.due ? `do ${fmtDay(t.due, input.today)}` : ""].filter(Boolean).join(" · "))}</span></span></div>`).join("")
        : empty("Žádné otevřené úkoly.");
      break;
    case "testy":
      body += input.tests.length
        ? input.tests.slice(0, 10).map((t) => `<div class="r"><span class="t"><b>${esc(t.subject)}</b>${t.topic ? ` · ${esc(t.topic)}` : ""}<br><span class="s">${esc(fmtDay(t.date, input.today))}</span></span></div>`).join("")
        : empty("Žádné testy v příštích 30 dnech.");
      break;
  }
  return page(title, body, theme, transparent);
}

/* ---------- propojení s Classmate bez kopírování adres ---------- */

/** Stránka /classmate/connect: po potvrzení pošle adresu manifestu zpět oknu Classmate přes postMessage. */
export function connectPage(origin: string | null, manifestUrl: string): string {
  const allowed = origin && embedOrigins().includes(origin.replace(/\/+$/, ""));
  const body = !origin
    ? `<h1>Propojení s Classmate</h1><p>Chybí parametr <code>origin</code>.</p>`
    : !allowed
      ? `<h1>Propojení s Classmate</h1><p>Adresa <b>${esc(origin)}</b> není v <code>EMBED_ORIGINS</code>. Přidej ji do <code>.env</code> a restartuj server.</p>`
      : `<h1>Propojení s Classmate</h1><p>Classmate na <b>${esc(origin)}</b> dostane adresu tvých widgetů (jen pro čtení).</p><button id="ok">Propojit</button><p id="msg" class="s"></p>
<script nonce="cm">document.getElementById("ok").onclick=function(){if(!window.opener){document.getElementById("msg").textContent="Otevři tuto stránku tlačítkem Přidat v Classmate.";return}window.opener.postMessage({type:"classmate-plugin",manifest:${JSON.stringify(manifestUrl)}},${JSON.stringify(origin.replace(/\/+$/, ""))});document.getElementById("msg").textContent="Hotovo, okno můžeš zavřít.";setTimeout(function(){window.close()},800)}</script>`;
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Propojení s Classmate</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:440px;margin:60px auto;padding:0 16px}button{font:inherit;padding:10px 18px;border-radius:10px;border:0;background:#2f6fed;color:#fff;cursor:pointer}.s{color:#666}</style></head><body>${body}</body></html>`;
}

export const connectCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-cm'; base-uri 'none'; frame-ancestors 'none'";
