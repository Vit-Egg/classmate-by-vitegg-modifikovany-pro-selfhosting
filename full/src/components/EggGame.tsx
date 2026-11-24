"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { confetti } from "@/lib/confetti";

type Item = { x: number; y: number; vy: number; r: number; v: 1 | 2 | 3 | 4 | 5; rot: number; vr: number };
type Pop = { x: number; y: number; t: number; text: string; c: string };

const ROUND = 25; // sekund
const POINTS = { 1: 10, 2: 5, 3: 2, 4: -3, 5: -10 } as const;
const COLORS = { 1: "", 2: "#9be15d", 3: "#ffd166", 4: "#f4a259", 5: "#ef6f6c" } as const;
const RANKS: [number, string][] = [[200, "Vyznamenání s pochvalou"], [130, "Prospěl s vyznamenáním"], [70, "Prospěl"], [20, "Dostatečná"], [-9999, "Opakuješ ročník"]];
const BEST_KEY = "classmate:egg-best";

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

/** Skrytá hra „Chyť jedničku“: padají známky, jedničky se sbírají, pětky se vyhýbají. Spouští se klepáním na verzi aplikace. */
export function EggGame() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"intro" | "play" | "end">("intro");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [fresh, setFresh] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef({ items: [] as Item[], pops: [] as Pop[], score: 0, left: ROUND, spawn: 0 });

  useEffect(() => {
    const on = () => { setPhase("intro"); setOpen(true); };
    window.addEventListener("classmate:egg-game", on);
    return () => window.removeEventListener("classmate:egg-game", on);
  }, []);

  // Konami kód: ↑ ↑ ↓ ↓ ← → ← → B A
  useEffect(() => {
    const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let at = 0;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (document.querySelector(".excalidraw") || t?.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      at = k === code[at] ? at + 1 : k === code[0] ? 1 : 0;
      if (at === code.length) {
        at = 0;
        window.dispatchEvent(new Event("classmate:egg-game"));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    setBest(readBest());
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", key); };
  }, [open, close]);

  const start = () => {
    game.current = { items: [], pops: [], score: 0, left: ROUND, spawn: 0 };
    setScore(0);
    setFresh(false);
    setPhase("play");
  };

  useEffect(() => {
    if (!open || phase !== "play") return;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const fit = () => {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7be0b0";
    const colorOf = (v: Item["v"]) => (v === 1 ? accent : COLORS[v]);
    const g = game.current;
    let last = performance.now();
    let raf = 0;
    let done = false;

    const hit = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      for (let i = g.items.length - 1; i >= 0; i--) {
        const it = g.items[i];
        if ((px - it.x) ** 2 + (py - it.y) ** 2 <= (it.r + 8) ** 2) {
          const pts = POINTS[it.v];
          g.score += pts;
          g.pops.push({ x: it.x, y: it.y, t: 0, text: pts > 0 ? `+${pts}` : `${pts}`, c: colorOf(it.v) });
          g.items.splice(i, 1);
          setScore(g.score);
          return;
        }
      }
    };
    cv.addEventListener("pointerdown", hit);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      g.left -= dt;
      const elapsed = ROUND - g.left;
      g.spawn -= dt;
      if (g.spawn <= 0 && g.left > 0) {
        g.spawn = Math.max(0.22, 0.62 - elapsed * 0.015);
        const r = 26 + Math.random() * 12;
        const roll = Math.random();
        g.items.push({ x: r + Math.random() * (W - 2 * r), y: -r, vy: H * 0.26 + elapsed * 9 + Math.random() * 60, r, v: roll < 0.34 ? 1 : roll < 0.54 ? 2 : roll < 0.72 ? 3 : roll < 0.86 ? 4 : 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 1.6 });
      }
      ctx.clearRect(0, 0, W, H);
      g.items = g.items.filter((it) => it.y - it.r < H);
      for (const it of g.items) {
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(Math.sin(it.rot) * 0.35);
        ctx.beginPath();
        ctx.arc(0, 0, it.r, 0, Math.PI * 2);
        ctx.fillStyle = colorOf(it.v);
        ctx.shadowColor = colorOf(it.v);
        ctx.shadowBlur = it.v === 1 ? 22 : 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0d1512";
        ctx.font = `800 ${Math.round(it.r * 1.15)}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(it.v), 0, 2);
        ctx.restore();
      }
      for (const p of g.pops) {
        p.t += dt;
        ctx.globalAlpha = Math.max(0, 1 - p.t / 0.7);
        ctx.fillStyle = p.c;
        ctx.font = "800 22px ui-rounded, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y - p.t * 60);
        ctx.globalAlpha = 1;
      }
      g.pops = g.pops.filter((p) => p.t < 0.7);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "700 18px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.max(0, Math.ceil(g.left))} s`, W - 20, 34);
      if (g.left <= 0 && !done) {
        done = true;
        const prev = readBest();
        const isBest = g.score > prev;
        if (isBest) try { localStorage.setItem(BEST_KEY, String(g.score)); } catch {}
        setBest(Math.max(prev, g.score));
        setFresh(isBest && g.score > 0);
        setScore(g.score);
        setPhase("end");
        if (g.score >= 130 && host.current) confetti(host.current, 0.3);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); cv.removeEventListener("pointerdown", hit); };
  }, [open, phase]);

  if (!open) return null;
  const rank = RANKS.find(([min]) => score >= min)?.[1] ?? "";
  return (
    <div ref={host} className="egg" role="dialog" aria-modal="true" aria-label="Skrytá hra Chyť jedničku">
      <canvas ref={canvas} className="egg-canvas" />
      <div className="egg-hud" aria-live="polite">
        <b>{score}</b> <span>bodů</span>
      </div>
      <button type="button" className="egg-x" aria-label="Zavřít hru" onClick={close}>×</button>
      {phase !== "play" && (
        <div className="egg-card">
          {phase === "intro" ? (
            <>
              <h2>Chyť jedničku!</h2>
              <p>Padají známky. Klepej na ně: <b>1</b> je 10 bodů, <b>5</b> tě stojí 10 bodů. Máš {ROUND} sekund.</p>
              {best > 0 && <p className="egg-best">Tvůj rekord: {best}</p>}
              <button className="btn primary" onClick={start} autoFocus>Začít</button>
            </>
          ) : (
            <>
              <h2>{rank}</h2>
              <p className="egg-score">{score} bodů</p>
              <p className="egg-best">{fresh ? "Nový rekord!" : `Rekord: ${best}`}</p>
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={start} autoFocus>Znovu</button>
                <button className="btn" onClick={close}>Zavřít</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
