"use client";

import { useRef, type ReactNode } from "react";

/** Klik na profilovku ji otevře velkou (Esc nebo klik mimo zavře). */
export function AvatarZoom({ src, name, children }: { src: string; name: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="av-zoom" onClick={() => ref.current?.showModal()} aria-label={`Zvětšit profilovku: ${name}`} title="Zvětšit">
        {children}
      </button>
      <dialog ref={ref} className="lightbox avatar-lightbox" onClick={() => ref.current?.close()} aria-label={`Profilovka: ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} />
        <button type="button" className="lightbox-x" aria-label="Zavřít" onClick={() => ref.current?.close()}>×</button>
      </dialog>
    </>
  );
}
