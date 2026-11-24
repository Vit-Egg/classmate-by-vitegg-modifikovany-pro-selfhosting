"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { discardPending, discardRecording, initRecorder, pauseRecording, savePending, stopRecording, useRecorder } from "@/lib/recorder";

const clock = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const when = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);

/**
 * Plovoucí panel nahrávání: je vidět na každé stránce aplikace i na celé obrazovce poznámky (kreslí se do prvku, který je zrovna na celé obrazovce)
 * a nahrávání přechodem mezi stránkami neskončí. Nabízí i uložení nahrávek, které po pádu nebo výpadku připojení zůstaly v zařízení.
 */
export function RecorderBar() {
  const s = useRecorder();
  const router = useRouter();
  const [host, setHost] = useState<Element | null>(null);
  const [mini, setMini] = useState(false);

  useEffect(() => {
    initRecorder();
    const where = () => setHost(document.fullscreenElement ?? document.body);
    where();
    const saved = () => router.refresh(); // seznam nahrávek u poznámky se načte znovu
    document.addEventListener("fullscreenchange", where);
    window.addEventListener("classmate:audio-saved", saved);
    return () => {
      document.removeEventListener("fullscreenchange", where);
      window.removeEventListener("classmate:audio-saved", saved);
    };
  }, [router]);

  // další nahrávání začíná zase s plným panelem
  useEffect(() => {
    if (s.status === "idle") setMini(false);
  }, [s.status]);

  // při nahrávání nesmí uživatel omylem stránku zavřít
  const live = s.status === "recording" || s.status === "paused";
  useEffect(() => {
    if (!live) return;
    const warn = (e: BeforeUnloadEvent) => (e.preventDefault(), (e.returnValue = ""));
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live]);

  if (!host || (s.status === "idle" && !s.pending.length && !s.error)) return null;
  const busy = s.status === "saving";

  return createPortal(
    <div className="rec-float" role="status" aria-live="polite">
      {s.status !== "idle" && mini && (
        <button type="button" className="rec-mini" onClick={() => setMini(false)} aria-label="Zobrazit nahrávání" title="Zobrazit nahrávání">
          <i className={`rec-dot live${s.status === "paused" || busy ? " paused" : ""}`} />
          <b className="rec-time">{clock(s.secs)}</b>
        </button>
      )}
      {s.status !== "idle" && !mini && (
        <div className="rec-pill">
          <i className={`rec-dot live${s.status === "paused" || busy ? " paused" : ""}`} />
          <b className="rec-time">{clock(s.secs)}</b>
          <span className="rec-label">
            {busy ? "Ukládám…" : s.status === "paused" ? "Pozastaveno" : "Nahrává se"}
            {s.noteId && <> · <Link href={`/poznamky/${s.noteId}`}>{s.title || "poznámka"}</Link></>}
          </span>
          {!busy && (
            <span className="rec-actions">
              <button type="button" className="btn small" onClick={pauseRecording}>{s.status === "paused" ? "Pokračovat" : "Pauza"}</button>
              <button type="button" className="btn small primary" onClick={stopRecording}>Uložit</button>
              <button type="button" className="btn small danger" onClick={() => window.confirm("Zahodit nahrávku?") && discardRecording()}>Zahodit</button>
              <button type="button" className="btn small" onClick={() => setMini(true)} aria-label="Minimalizovat" title="Minimalizovat">Skrýt</button>
            </span>
          )}
        </div>
      )}
      {s.error && <p className="rec-error">{s.error}</p>}
      {s.pending.map((p) => (
        <div key={p.id} className="rec-pill pending">
          <span className="rec-label">
            {p.ready ? "Neodeslaná nahrávka" : "Nedokončená nahrávka"} z {when(p.startedAt)} ({p.seconds ? clock(p.seconds) : mb(p.bytes)}){p.title ? <> · {p.title}</> : null}
          </span>
          <span className="rec-actions">
            <button type="button" className="btn small primary" disabled={busy} onClick={() => void savePending(p.id)}>Uložit k poznámce</button>
            <button type="button" className="btn small danger" disabled={busy} onClick={() => window.confirm("Zahodit tuhle nahrávku? Nejde to vrátit.") && void discardPending(p.id)}>Zahodit</button>
          </span>
        </div>
      ))}
    </div>,
    host,
  );
}
