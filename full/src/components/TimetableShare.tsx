"use client";

import { useEffect, useRef, useState } from "react";
import type { ShareModel } from "./Timetable";

const toText = (m: ShareModel) =>
  [
    m.title,
    ...m.days.flatMap((d, di) => {
      const rows = m.hours.flatMap((h, hi) => m.cells[di][hi].map((c) => `${h.hour}. ${h.begin}–${h.end}  ${c.cancelled ? `${c.text} (odpadá)` : c.text}${c.meta && !c.cancelled ? ` (${c.meta})` : ""}`));
      return ["", `${d.label}${d.sub ? " " + d.sub : ""}`, ...(d.allDay ? [d.allDay] : rows.length ? rows : ["bez hodin"])];
    }),
  ].join("\n");

/** Nakreslí rozvrh jako obrázek (světlé pozadí, ať je čitelný všude a dobře se tiskne). */
function toPng(m: ShareModel): Promise<Blob | null> {
  // barvy v aplikaci jsou light-dark(...), canvas je nezná: necháme prohlížeč, ať je přepočítá (vždy světlá varianta)
  const probe = document.createElement("span");
  probe.style.colorScheme = "light";
  document.body.appendChild(probe);
  const hue = (h: string) => {
    probe.style.color = "#8d939c";
    probe.style.color = `var(--h-${h})`;
    return getComputedStyle(probe).color;
  };
  const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const S = 2;
  const sideW = 84, headH = 64, titleH = 70, pad = 28, gap = 8, colW = 230, minRow = 78;
  const W = pad * 2 + sideW + 5 * colW + 5 * gap;
  const rowH = m.hours.map((_, hi) => Math.max(minRow, ...m.cells.map((d) => (d[hi].length ? d[hi].length * (minRow - 10) + (d[hi].length - 1) * 6 : 0))));
  const H = pad * 2 + titleH + headH + gap + rowH.reduce((a, b) => a + b + gap, 0);
  const cv = document.createElement("canvas");
  cv.width = W * S;
  cv.height = H * S;
  const g = cv.getContext("2d")!;
  g.scale(S, S);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  const rr = (x: number, y: number, w: number, h: number, r: number) => (g.beginPath(), g.roundRect(x, y, w, h, r), g.fill());
  const fit = (t: string, w: number) => {
    if (g.measureText(t).width <= w) return t;
    while (t.length > 1 && g.measureText(t + "…").width > w) t = t.slice(0, -1);
    return t + "…";
  };
  g.textBaseline = "middle";
  g.fillStyle = "#1a1a1f";
  g.font = font(800, 28);
  g.fillText(m.title, pad, pad + 26);
  const x0 = pad + sideW + gap;
  const y0 = pad + titleH;
  m.days.forEach((d, i) => {
    const x = x0 + i * (colW + gap);
    g.fillStyle = "#f1eee9";
    rr(x, y0, colW, headH, 14);
    g.fillStyle = "#1a1a1f";
    g.textAlign = "center";
    g.font = font(700, 17);
    g.fillText(d.label, x + colW / 2, y0 + (d.sub ? 22 : headH / 2));
    if (d.sub) {
      g.fillStyle = "#6b6f78";
      g.font = font(500, 14);
      g.fillText(d.sub, x + colW / 2, y0 + 44);
    }
  });
  let y = y0 + headH + gap;
  m.hours.forEach((h, hi) => {
    g.textAlign = "center";
    g.fillStyle = "#6b6f78";
    g.font = font(500, 13);
    g.fillText(h.begin, pad + sideW / 2, y + rowH[hi] / 2 - 18);
    g.fillStyle = "#1a1a1f";
    g.font = font(800, 22);
    g.fillText(String(h.hour), pad + sideW / 2, y + rowH[hi] / 2);
    g.fillStyle = "#6b6f78";
    g.font = font(500, 13);
    g.fillText(h.end, pad + sideW / 2, y + rowH[hi] / 2 + 18);
    m.days.forEach((d, di) => {
      const x = x0 + di * (colW + gap);
      if (d.allDay) {
        if (hi === 0) {
          const total = rowH.reduce((a, b) => a + b + gap, -gap);
          g.fillStyle = "#dbeaf3";
          rr(x, y, colW, total, 14);
          g.fillStyle = "#1f5f82";
          g.font = font(700, 17);
          g.fillText(fit(d.allDay, colW - 24), x + colW / 2, y + total / 2);
        }
        return;
      }
      const list = m.cells[di][hi];
      const ch = list.length ? (rowH[hi] - (list.length - 1) * 6) / list.length : 0;
      list.forEach((c, i) => {
        const cy = y + i * (ch + 6);
        const col = hue(c.hue);
        g.fillStyle = c.cancelled ? "#f4f4f4" : "#ffffff";
        rr(x, cy, colW, ch, 14);
        g.globalAlpha = c.cancelled ? 0.06 : 0.16;
        g.fillStyle = col;
        rr(x, cy, colW, ch, 14);
        g.globalAlpha = 1;
        g.fillStyle = col;
        rr(x, cy + 10, 4, ch - 20, 2);
        g.textAlign = "left";
        g.fillStyle = c.cancelled ? "#8d939c" : "#1a1a1f";
        g.font = font(700, 16);
        const t = fit(c.text, colW - 34);
        g.fillText(t, x + 16, cy + (c.meta ? ch / 2 - 11 : ch / 2));
        if (c.cancelled) g.fillRect(x + 16, cy + (c.meta ? ch / 2 - 11 : ch / 2), g.measureText(t).width, 1.5);
        if (c.meta) {
          g.fillStyle = "#6b6f78";
          g.font = font(500, 13);
          g.fillText(fit(c.meta, colW - 34), x + 16, cy + ch / 2 + 12);
        }
      });
    });
    y += rowH[hi] + gap;
  });
  g.textAlign = "right";
  g.fillStyle = "#9a9ea6";
  g.font = font(500, 12);
  g.fillText("Classmate", W - pad, H - 14);
  probe.remove();
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

/** Tlačítka u rozvrhu: vytisknout, sdílet jako obrázek nebo text. */
export function TimetableShare({ model, file }: { model: ShareModel; file: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const close = (e: Event) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute("open");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && ref.current?.removeAttribute("open");
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const done = (msg: string) => {
    ref.current?.removeAttribute("open");
    setNote(msg);
    setTimeout(() => setNote(""), 2500);
  };
  const download = (blob: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const image = async () => {
    const blob = await toPng(model);
    if (!blob) return done("Obrázek se nepodařilo vytvořit.");
    const f = new File([blob], `${file}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: model.title });
        return done("");
      } catch (e) {
        if ((e as Error).name === "AbortError") return done("");
      }
    }
    download(blob);
    done("Obrázek se stáhl.");
  };
  const text = async () => {
    const t = toText(model);
    if (navigator.share) {
      try {
        await navigator.share({ title: model.title, text: t });
        return done("");
      } catch (e) {
        if ((e as Error).name === "AbortError") return done("");
      }
    }
    try {
      await navigator.clipboard.writeText(t);
      done("Rozvrh je zkopírovaný.");
    } catch {
      done("Kopírování se nepovedlo.");
    }
  };
  return (
    <div className="tt-actions">
      {note && <span className="hint" role="status">{note}</span>}
      <button type="button" className="btn small" onClick={() => window.print()}>Vytisknout</button>
      <details ref={ref} className="menu">
        <summary className="btn small">Sdílet</summary>
        <div className="menu-pop" role="menu">
          <button type="button" className="menu-item" role="menuitem" onClick={() => void image()}>Jako obrázek</button>
          <button type="button" className="menu-item" role="menuitem" onClick={() => void text()}>Jako text</button>
        </div>
      </details>
    </div>
  );
}
