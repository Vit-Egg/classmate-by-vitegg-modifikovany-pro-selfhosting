"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pragueClock } from "@/lib/dates";
import { tickAligned } from "@/lib/ticker";
import { dayState, fmtMin, type Slot } from "@/lib/schedule";

type Cfg = {
  theme: string; accent: string; font: "sans" | "mono" | "serif" | "round"; weight: number; scale: number; align: "center" | "left";
  countdown: "mmss" | "text" | "minutes"; kind: "bar" | "ring" | "none"; barH: number;
  prec: "s" | "d" | "c"; precP: "s" | "d" | "c" | "t" | "x"; main: "time" | "pct"; fs: boolean; awake: boolean; ringW: number; ringSize: number; ringCap: "round" | "butt"; ringDir: "fill" | "drain"; ringTrack: boolean; ringGlow: boolean;
  label: boolean; room: boolean; caption: boolean; next: boolean; timeline: boolean; clock: boolean; seconds: boolean; date: boolean; percent: boolean; autoHide: boolean;
};
const DEF: Cfg = { theme: "auto", accent: "", font: "sans", weight: 700, scale: 100, align: "center", countdown: "mmss", kind: "bar", barH: 16, label: true, room: true, caption: true, next: true, timeline: false, clock: true, seconds: false, date: false, prec: "s", precP: "s", main: "time", fs: true, awake: true, ringW: 7, ringSize: 100, ringCap: "round", ringDir: "fill", ringTrack: true, ringGlow: true, percent: false, autoHide: true };
const KEY = "bell_full_v1";
const DIG = { s: 0, d: 1, c: 2, t: 3, x: 4 } as const;
const THEMES: Record<string, { name: string; bg: string; fg: string; accent: string }> = {
  auto: { name: "Podle aplikace", bg: "var(--bg)", fg: "var(--text)", accent: "var(--accent)" },
  light: { name: "Světlý", bg: "#f6f5f1", fg: "#16181b", accent: "#0e7c56" },
  dark: { name: "Tmavý", bg: "#111315", fg: "#f1f2f4", accent: "#4ae0a0" },
  black: { name: "Černý", bg: "#000", fg: "#fff", accent: "#4ae0a0" },
  green: { name: "Zelený", bg: "#0b2e22", fg: "#dcfbe9", accent: "#5eeaa8" },
  blue: { name: "Modrý", bg: "#0c1f3d", fg: "#e0ecff", accent: "#6aa8ff" },
  purple: { name: "Fialový", bg: "#1d1236", fg: "#efe6ff", accent: "#b196ff" },
  orange: { name: "Oranžový", bg: "#2b1606", fg: "#ffe9d2", accent: "#ffa04a" },
};
const FONTS = { sans: "inherit", mono: "ui-monospace, SFMono-Regular, Menlo, monospace", serif: "Georgia, 'Times New Roman', serif", round: "'Nunito', 'Trebuchet MS', system-ui, sans-serif" };
const ACCENTS = ["", "#4ae0a0", "#6aa8ff", "#b196ff", "#ffa04a", "#ff6b6b", "#ffd84a", "#ffffff"];

const two = (n: number) => String(n).padStart(2, "0");
const mmss = (secs: number) => `${two(Math.floor(secs / 60))}:${two(secs % 60)}`;
const plural = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

function Seg<T extends string>({ value, opts, on }: { value: T; opts: [T, string][]; on: (v: T) => void }) {
  return <div className="bf-seg" role="radiogroup">{opts.map(([v, t]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => on(v)}>{t}</button>)}</div>;
}
function Sw({ on, label, set }: { on: boolean; label: string; set: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`bf-sw-row${on ? " on" : ""}`} onClick={() => set(!on)}><span>{label}</span><i /></button>;
}

function load(): Cfg {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEF; }
}

function Screen({ slots, onClose, startFs }: { slots: Slot[]; onClose: () => void; startFs: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<Cfg>(DEF);
  const [now, setNow] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);
  const [fs, setFs] = useState(startFs);
  const [ui, setUi] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => { const n = { ...c, [k]: v }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} return n; });

  useEffect(() => { setCfg(load()); }, []);
  // čas v minutách od půlnoci; s přesností pod vteřinu se překresluje plynule (každý snímek)
  const fast = cfg.prec !== "s" || cfg.precP !== "s";
  useEffect(() => {
    const t = () => setNow(pragueClock() + (fast ? (Date.now() % 1000) / 60000 : 0));
    t();
    if (!fast) return tickAligned(t, 1000);
    let raf = 0;
    const loop = () => { t(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fast]);
  // nevypínat displej (Wake Lock; po návratu na kartu se zámek znovu vezme)
  useEffect(() => {
    if (!cfg.awake) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const take = async () => {
      try { const l = await navigator.wakeLock?.request("screen"); if (dead) void l?.release(); else lock = l ?? null; } catch {}
    };
    void take();
    const vis = () => { if (document.visibilityState === "visible") void take(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); };
  }, [cfg.awake]);
  // celá obrazovka prohlížeče se dá zapnout i vypnout za běhu; Esc z ní vrátí jen okno, další Esc zavře
  useEffect(() => {
    const el = host.current;
    if (fs) { try { void el?.requestFullscreen?.(); } catch {} }
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [fs]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFs(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);
  // ovládací prvky se po chvíli bez pohybu schovají (i kurzor)
  const wake = () => {
    setUi(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setUi(false), 3500);
  };
  useEffect(() => { wake(); return () => clearTimeout(idle.current); }, []);
  const showUi = !cfg.autoHide || ui || panel;

  const th = THEMES[cfg.theme] ?? THEMES.auto;
  const accent = cfg.accent || th.accent;
  const s = now == null ? null : dayState(slots, now);
  const active = slots.filter((x) => !x.cancelled);

  // obsah podle stavu dne
  let label = "";
  let caption = "";
  let secs: number | null = null;
  let secF = 0; // zbývající vteřiny i se zlomky
  let progress: number | null = null;
  let room = "";
  let hue = "";
  let next = "";
  let idleMsg = "";
  if (s?.kind === "in") {
    label = s.slot.selfStudy ? `Samostudium · ${s.slot.subject}` : s.slot.subject;
    caption = "do konce hodiny";
    secs = s.secs;
    secF = (s.slot.end - (now ?? 0)) * 60;
    progress = s.slot.end > s.slot.begin ? ((now ?? 0) - s.slot.begin) / (s.slot.end - s.slot.begin) : s.progress;
    room = s.slot.room ?? "";
    hue = s.slot.hue;
    const n = active.find((x) => x.begin >= s.slot.end);
    next = n ? `Pak ${n.subject}${n.room ? ` · ${n.room}` : ""} ve ${fmtMin(n.begin)}` : "Poslední hodina";
  } else if (s?.kind === "break") {
    label = "Přestávka";
    caption = "do další hodiny";
    secs = s.secs;
    secF = (s.next.begin - (now ?? 0)) * 60;
    const prev = [...active].reverse().find((x) => x.end <= (now ?? 0));
    if (prev) progress = ((now ?? 0) - prev.end) / (s.next.begin - prev.end);
    next = `Pak ${s.next.subject}${s.next.room ? ` · ${s.next.room}` : ""} ve ${fmtMin(s.next.begin)}`;
  } else if (s?.kind === "before") {
    label = s.home ? "Samostudium" : "Do školy";
    caption = "do začátku";
    secs = s.secs;
    secF = (s.first.begin - (now ?? 0)) * 60;
    next = `První hodina: ${s.first.subject} ve ${fmtMin(s.first.begin)}`;
  } else if (s?.kind === "after") { label = "Po škole"; idleMsg = `Dnešek máš za sebou, končil jsi v ${fmtMin(s.last.end)}`; }
  else if (s?.kind === "home") { label = "Samostudium"; idleMsg = "Dnes ve škole být nemusíš"; }
  else if (s?.kind === "none") { label = "Dnes bez hodin"; idleMsg = "Užij si volno"; }

  const dig = DIG[cfg.prec];
  const frac = (v: number) => (dig ? `.${String(Math.floor((v - Math.floor(v)) * 10 ** dig)).padStart(dig, "0")}` : "");
  const cd = secs == null ? "" : cfg.countdown === "mmss" ? (dig ? mmss(Math.max(0, Math.floor(secF))) + frac(Math.max(0, secF)) : mmss(secs)) : cfg.countdown === "minutes" ? `${Math.max(1, Math.ceil(secs / 60))} min` : secs < 60 ? `${secs} ${plural(secs, "vteřina", "vteřiny", "vteřin")}` : `${Math.ceil(secs / 60)} ${plural(Math.ceil(secs / 60), "minuta", "minuty", "minut")}`;
  const nowSec = now == null ? 0 : now * 60;
  const clock = now == null ? "" : `${two(Math.floor(now / 60) % 24)}:${two(Math.floor(now % 60))}${cfg.seconds ? `:${two(Math.floor(nowSec % 60))}${frac(nowSec)}` : ""}`;
  const date = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Prague" });
  const pctV = progress == null ? 0 : Math.min(100, Math.max(0, progress * 100));
  const pct = Math.round(pctV);
  const digP = DIG[cfg.precP];
  const pctText = `${pctV.toFixed(digP).replace(".", ",")} %`;
  const pctWord = s?.kind === "break" ? "přestávky" : "hodiny";
  const big = cfg.main === "pct" && progress != null ? pctText : cd;
  const bigCap = cfg.main === "pct" && progress != null ? `z ${pctWord === "hodiny" ? "hodiny" : "přestávky"}` : caption;
  const school = active.filter((x) => !x.selfStudy);
  const t0 = school[0]?.begin ?? 0;
  const t1 = school[school.length - 1]?.end ?? 1;

  const C = 2 * Math.PI * 90;
  return createPortal(
    <div
      ref={host}
      className={`bf${showUi ? "" : " bf-idle"}${panel ? " bf-paneled" : ""}`}
      data-align={cfg.align}
      style={{ ["--bf-bg" as string]: th.bg, ["--bf-fg" as string]: th.fg, ["--bf-ac" as string]: accent, ["--bf-s" as string]: cfg.scale / 100, ["--bf-w" as string]: cfg.weight, ["--bf-font" as string]: FONTS[cfg.font], ["--bf-bar" as string]: `${cfg.barH}px` }}
      onPointerMove={wake}
      onClick={() => { if (!panel) setUi((u) => !u); }}
      role="dialog"
      aria-label="Průběh hodiny"
    >
      <div className="bf-top">
        <div className="bf-ctl" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setPanel((p) => !p)} aria-expanded={panel}>⚙ Upravit</button>
          <button type="button" onClick={onClose}>Zavřít</button>
        </div>
        {cfg.clock && !!big && <div className="bf-clock"><b>{clock}</b>{cfg.date && <small>{date}</small>}</div>}
      </div>

      <div className="bf-main">
        {cfg.label && <div className="bf-label" style={hue ? { ["--hue" as string]: `var(--h-${hue})` } : undefined}>{hue && <i className="bf-dot" />}{label}{cfg.room && room ? <span> · {room}</span> : null}</div>}
        {big && cfg.kind === "ring" ? (
          <div className="bf-ringwrap" style={{ ["--bf-rs" as string]: cfg.ringSize / 100, ["--bf-len" as string]: Math.max(5, big.length) }}>
            <svg viewBox="0 0 200 200" className={`bf-ring${cfg.ringGlow ? "" : " noglow"}`} aria-hidden>
              {cfg.ringTrack && <circle cx="100" cy="100" r="90" className="bf-ring-bg" strokeWidth={cfg.ringW} />}
              {progress != null && <circle cx="100" cy="100" r="90" className="bf-ring-fg" strokeWidth={cfg.ringW} strokeLinecap={cfg.ringCap} strokeDasharray={C} strokeDashoffset={C * (cfg.ringDir === "fill" ? 1 - Math.min(1, Math.max(0, progress)) : Math.min(1, Math.max(0, progress)))} transform="rotate(-90 100 100)" />}
            </svg>
            <div className="bf-ring-in"><div className="bf-count">{big}</div>{cfg.caption && <div className="bf-cap">{bigCap}</div>}</div>
          </div>
        ) : (
          <>
            {big && <div className="bf-count">{big}</div>}
            {big && cfg.caption && <div className="bf-cap">{bigCap}</div>}
            {progress != null && cfg.kind === "bar" && (
              <div className="bf-bar"><i style={{ width: `${pctV}%` }} /></div>
            )}
          </>
        )}
        {cfg.percent && progress != null && cd && (cfg.main === "pct"
          ? <div className="bf-pct"><b>{cd}</b> do {s?.kind === "break" ? "konce přestávky" : s?.kind === "before" ? "začátku" : "konce hodiny"}</div>
          : <div className="bf-pct"><b>{pctText}</b> {pctWord}</div>)}
        {!big && now != null && (
          <div className="bf-rest">
            <div className="bf-bigclock">{two(Math.floor(now / 60) % 24)}:{two(Math.floor(now % 60))}</div>
            <div className="bf-restdate">{date}</div>
            {idleMsg && <div className="bf-next">{idleMsg}</div>}
          </div>
        )}
        {cfg.next && next && <div className="bf-next">{next}</div>}
      </div>

      {cfg.timeline && school.length > 0 && now != null && (
        <div className="bf-tl" aria-hidden>
          {active.map((x) => (
            <div key={x.hour} className={`bf-tl-i${now >= x.begin && now < x.end ? " on" : now >= x.end ? " done" : ""}`} style={{ flexGrow: Math.max(1, x.end - x.begin), flexBasis: 0, ["--hue" as string]: `var(--h-${x.hue})` }} title={`${x.subject} ${fmtMin(x.begin)}–${fmtMin(x.end)}`}>
              <span>{x.subject}</span>
            </div>
          ))}
          <i className="bf-tl-now" style={{ left: `${Math.min(100, Math.max(0, ((now - t0) / (t1 - t0)) * 100))}%` }} />
        </div>
      )}

      {panel && (
        <aside className="bf-panel" onClick={(e) => e.stopPropagation()} aria-label="Úpravy zobrazení">
          <h3>Vzhled <button type="button" className="bf-x" onClick={() => setPanel(false)} aria-label="Zavřít úpravy">×</button></h3>
          <div className="bf-grp">
            <span className="bf-l">Motiv</span>
            <div className="bf-themes">{Object.entries(THEMES).map(([k, v]) => <button type="button" key={k} title={v.name} aria-label={v.name} className={cfg.theme === k ? "on" : ""} style={{ background: k === "auto" ? "linear-gradient(135deg,#f6f5f1 50%,#111315 50%)" : v.bg, color: v.accent }} onClick={() => set("theme", k)}><b>Aa</b></button>)}</div>
            <span className="bf-l">Barva průběhu</span>
            <div className="bf-sw">{ACCENTS.map((a) => <button type="button" key={a || "def"} className={cfg.accent === a ? "on" : ""} style={{ background: a || th.accent }} title={a || "Podle motivu"} onClick={() => set("accent", a)} />)}<input type="color" value={cfg.accent || "#4ae0a0"} onChange={(e) => set("accent", e.target.value)} aria-label="Vlastní barva" /></div>
          </div>
          <div className="bf-grp">
            <span className="bf-l">Písmo</span>
            <Seg value={cfg.font} on={(v) => set("font", v)} opts={[["sans", "Základní"], ["mono", "Strojové"], ["serif", "Patkové"], ["round", "Oblé"]]} />
            <span className="bf-l">Tloušťka <em>{cfg.weight}</em></span>
            <input type="range" min={300} max={900} step={100} value={cfg.weight} onChange={(e) => set("weight", Number(e.target.value))} />
            <span className="bf-l">Velikost <em>{cfg.scale} %</em></span>
            <input type="range" min={50} max={180} step={5} value={cfg.scale} onChange={(e) => set("scale", Number(e.target.value))} />
            <span className="bf-l">Zarovnání</span>
            <Seg value={cfg.align} on={(v) => set("align", v)} opts={[["center", "Na střed"], ["left", "Doleva"]]} />
          </div>
          <h3>Odpočet</h3>
          <div className="bf-grp">
            <span className="bf-l">Formát</span>
            <Seg value={cfg.countdown} on={(v) => set("countdown", v)} opts={[["mmss", "05:42"], ["minutes", "6 min"], ["text", "Slovy"]]} />
            <span className="bf-l">Hlavní hodnota</span>
            <Seg value={cfg.main} on={(v) => set("main", v)} opts={[["time", "Čas"], ["pct", "Procenta"]]} />
            <span className="bf-l">Přesnost času</span>
            <Seg value={cfg.prec} on={(v) => set("prec", v)} opts={[["s", "Vteřiny"], ["d", "Desetiny"], ["c", "Setiny"]]} />
            <span className="bf-l">Přesnost procent</span>
            <Seg value={cfg.precP} on={(v) => set("precP", v)} opts={[["s", "Celá"], ["d", "Desetiny"], ["c", "Setiny"], ["t", "Tisíciny"], ["x", "Desetitisíciny"]]} />
            <span className="bf-l">Ukazatel</span>
            <Seg value={cfg.kind} on={(v) => set("kind", v)} opts={[["bar", "Pruh"], ["ring", "Kruh"], ["none", "Žádný"]]} />
            {cfg.kind === "ring" && (<>
              <span className="bf-l">Velikost kruhu <em>{cfg.ringSize} %</em></span>
              <input type="range" min={40} max={120} step={5} value={cfg.ringSize} onChange={(e) => set("ringSize", Number(e.target.value))} />
              <span className="bf-l">Tloušťka kruhu <em>{cfg.ringW}</em></span>
              <input type="range" min={2} max={24} value={cfg.ringW} onChange={(e) => set("ringW", Number(e.target.value))} />
              <span className="bf-l">Směr</span>
              <Seg value={cfg.ringDir} on={(v) => set("ringDir", v)} opts={[["fill", "Plní se"], ["drain", "Ubývá"]]} />
              <span className="bf-l">Konce</span>
              <Seg value={cfg.ringCap} on={(v) => set("ringCap", v)} opts={[["round", "Oblé"], ["butt", "Rovné"]]} />
              <Sw on={cfg.ringTrack} label="Ukázat podkladový kruh" set={(v) => set("ringTrack", v)} />
              <Sw on={cfg.ringGlow} label="Záře kolem kruhu" set={(v) => set("ringGlow", v)} />
            </>)}
            {cfg.kind === "bar" && (<><span className="bf-l">Tloušťka pruhu <em>{cfg.barH} px</em></span><input type="range" min={4} max={60} value={cfg.barH} onChange={(e) => set("barH", Number(e.target.value))} /></>)}
          </div>
          <h3>Co ukázat</h3>
          <div className="bf-grp tight"><Sw on={fs} label="Celá obrazovka prohlížeče" set={(v) => { setFs(v); set("fs", v); }} />
            <Sw on={cfg.awake} label="Nevypínat obrazovku" set={(v) => set("awake", v)} /></div>
          <div className="bf-grp tight">
            {([["label", "Předmět nebo stav"], ["room", "Učebna"], ["caption", "Popisek pod odpočtem"], ["percent", "Druhá hodnota (procenta nebo čas)"], ["next", "Co bude potom"], ["timeline", "Osa celého dne"], ["clock", "Hodiny"], ["seconds", "Hodiny s vteřinami"], ["date", "Datum"], ["autoHide", "Skrýt ovládání po chvíli"]] as [keyof Cfg, string][]).map(([k, t]) => (
              <Sw key={k} on={cfg[k] as boolean} label={t} set={(v) => set(k, v as never)} />
            ))}
          </div>
          <button type="button" className="bf-reset" onClick={() => { setCfg(DEF); try { localStorage.removeItem(KEY); } catch {} }}>Vrátit výchozí</button>
        </aside>
      )}
    </div>,
    document.body,
  );
}

/** Tlačítko vlevo dole u zvonění: průběh hodiny samostatně na celou obrazovku, s hodně možnostmi vzhledu (ukládají se v tomhle prohlížeči). */
export function BellFullButton({ slots, inline }: { slots: Slot[]; inline?: boolean }) {
  const [open, setOpen] = useState<null | boolean>(null); // hodnota = zda začít na celé obrazovce
  const close = useCallback(() => setOpen(null), []);
  if (!slots.length) return null;
  return (
    <>
      <div className={inline ? "bell-full-btns inline" : "bell-full-btns"}>
        <button type="button" className="bell-full-btn" title="Průběh hodiny na celou obrazovku" aria-label="Průběh hodiny na celou obrazovku" onClick={() => setOpen(load().fs)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </button>
      </div>
      {open !== null && <Screen slots={slots} onClose={close} startFs={open} />}
    </>
  );
}
