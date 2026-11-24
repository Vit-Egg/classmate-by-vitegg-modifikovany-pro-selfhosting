"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const OUT = 512; // výsledná profilovka (čtverec)
const VIEW = 280; // velikost náhledu při ořezávání

type Crop = { bmp: ImageBitmap; zoom: number; x: number; y: number };

/** Zobrazená velikost obrázku při zoomu 1: kratší strana vyplní celý čtverec. */
const baseScale = (bmp: ImageBitmap) => VIEW / Math.min(bmp.width, bmp.height);
/** Posun se drží tak, aby obrázek vždy pokrýval celý čtverec. */
function clamp(c: Crop): Crop {
  const s = baseScale(c.bmp) * c.zoom;
  const mx = Math.max(0, (c.bmp.width * s - VIEW) / 2);
  const my = Math.max(0, (c.bmp.height * s - VIEW) / 2);
  return { ...c, x: Math.min(mx, Math.max(-mx, c.x)), y: Math.min(my, Math.max(-my, c.y)) };
}

async function render(c: Crop): Promise<Blob> {
  const s = baseScale(c.bmp) * c.zoom;
  const side = VIEW / s; // strana vybrané oblasti ve zdrojových pixelech
  const sx = c.bmp.width / 2 - c.x / s - side / 2;
  const sy = c.bmp.height / 2 - c.y / s - side / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Prohlížeč neumí obrázek zpracovat.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c.bmp, sx, sy, side, side, 0, 0, OUT, OUT);
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (out && out.type === "image/webp") return out;
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpg) throw new Error("Obrázek se nepodařilo zpracovat.");
  return jpg;
}

/** Výběr profilovky: po výběru souboru se otevře ořezávač (posun tažením, přiblížení posuvníkem), výsledek se zmenší a pošle na server. */
export function AvatarUpload({ has, remove }: { has: boolean; remove: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<Crop | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!/^image\//.test(file.type)) return setError("Vyber obrázek.");
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      setCrop({ bmp, zoom: 1, x: 0, y: 0 });
    } catch {
      setError("Obrázek se nepodařilo otevřít.");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  useEffect(() => {
    if (crop && !dialog.current?.open) dialog.current?.showModal();
  }, [crop]);

  // náhled: obrázek v kruhu podle aktuálního posunu a přiblížení
  useEffect(() => {
    const cv = preview.current;
    if (!crop || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = VIEW * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = baseScale(crop.bmp) * crop.zoom;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(crop.bmp, VIEW / 2 + crop.x - (crop.bmp.width * s) / 2, VIEW / 2 + crop.y - (crop.bmp.height * s) / 2, crop.bmp.width * s, crop.bmp.height * s);
  }, [crop]);

  const close = () => {
    dialog.current?.close();
    crop?.bmp.close();
    setCrop(null);
  };

  const save = async () => {
    if (!crop) return;
    setBusy(true);
    setError("");
    try {
      const blob = await render(crop);
      const r = await fetch("/avatar", { method: "POST", body: blob });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Nahrání se nepovedlo.");
      close();
      router.refresh();
    } catch (e) {
      close();
      setError(e instanceof Error ? e.message : "Nahrání se nepovedlo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Nahrávám…" : has ? "Změnit fotku" : "Nahrát fotku"}</button>
        {has && (
          <button type="button" className="btn danger" disabled={busy} onClick={async () => { setBusy(true); try { await remove(); router.refresh(); } finally { setBusy(false); } }}>Odebrat</button>
        )}
      </div>
      {error && <p className="msg-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}

      <dialog ref={dialog} className="crop-dialog" onClose={() => { if (crop) { crop.bmp.close(); setCrop(null); } }} aria-label="Oříznutí profilovky">
        {crop && (
          <div className="crop-body">
            <h2 className="section" style={{ margin: 0 }}>Oříznout profilovku</h2>
            <div
              className="crop-stage"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }; }}
              onPointerMove={(e) => { const d = drag.current; if (d) setCrop(clamp({ ...crop, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })); }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onWheel={(e) => setCrop(clamp({ ...crop, zoom: Math.min(4, Math.max(1, crop.zoom - e.deltaY / 400)) }))}
            >
              <canvas ref={preview} style={{ width: VIEW, height: VIEW }} />
              <span className="crop-ring" aria-hidden />
            </div>
            <label className="crop-zoom">
              <span>Přiblížení</span>
              <input type="range" min={1} max={4} step={0.01} value={crop.zoom} onChange={(e) => setCrop(clamp({ ...crop, zoom: Number(e.target.value) }))} aria-label="Přiblížení" />
            </label>
            <p className="hint" style={{ margin: 0 }}>Obrázek přesuň tažením. Ve výsledku bude vidět to, co je v kruhu.</p>
            <div className="btn-row">
              <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Nahrávám…" : "Uložit"}</button>
              <button type="button" className="btn" disabled={busy} onClick={close}>Zrušit</button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
