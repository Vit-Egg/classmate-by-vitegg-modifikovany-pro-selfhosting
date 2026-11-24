"use client";

import { useEffect, useRef, useState } from "react";

/** Klik na obrázek v poznámce ho otevře velký přes celou obrazovku. Esc nebo klik mimo zavře. */
export function ImageLightbox() {
  const ref = useRef<HTMLDialogElement>(null);
  const [img, setImg] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("img.note-img") as HTMLImageElement | null;
      if (!el || !el.closest(".note-content")) return;
      // v editoru nejdřív obrázek jen označí, velký se otevře dvojklikem; ve čtečce rovnou
      const editable = el.closest("[contenteditable=true]");
      if (editable && e.detail < 2) return;
      setImg({ src: el.currentSrc || el.src, alt: el.alt });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  useEffect(() => {
    if (img && !ref.current?.open) ref.current?.showModal();
  }, [img]);

  return (
    <dialog ref={ref} className="lightbox" onClose={() => setImg(null)} onClick={() => ref.current?.close()} aria-label="Obrázek ve velkém">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} alt={img.alt} />
      )}
      <button type="button" className="lightbox-x" aria-label="Zavřít" onClick={() => ref.current?.close()}>×</button>
    </dialog>
  );
}
