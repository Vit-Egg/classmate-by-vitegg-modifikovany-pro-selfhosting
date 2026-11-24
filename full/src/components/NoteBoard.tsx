"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, MainMenu, serializeAsJSON } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boardElements, clearBoardDraft, loadBoardDraft, saveBoardDraft } from "@/lib/note-draft";

type Props = {
  /** uložená scéna (JSON), prázdné = nová tabule */
  initial: string;
  readOnly?: boolean;
  /** poznámka, ke které tabule patří (záloha v prohlížeči se ukládá pod jejím číslem) */
  draftId?: number | string;
  /** volá se po krátké odmlce se scénou jako JSON; vrací chybovou hlášku, nebo nic; hodnota „conflict“ znamená změnu jinde (neopakuje se) */
  onSave?: (json: string) => Promise<string | void>;
  /** stav ukládání pro společný údaj v hlavičce poznámky */
  onStatus?: (s: "saved" | "dirty" | "saving" | "error") => void;
  /** přes tento odkaz jde vynutit okamžité uložení (Ctrl+S) */
  flushRef?: { current: (() => Promise<void>) | null };
};

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t === "dark" ? true : t === "light" ? false : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Tabule jako Excalidraw: kreslení, tvary, šipky, text, obrázky, gumování, zoom. Scéna se ukládá do poznámky. Písma jsou z vlastního serveru (public/excalidraw). */
export default function NoteBoard({ initial, readOnly = false, draftId, onSave, onStatus, flushRef }: Props) {
  const [boot, setBootRaw] = useState(initial);
  const [bootKey, setBootKey] = useState(0);
  const setBoot = (json: string) => { setBootRaw(json); setBootKey((k) => k + 1); }; // scéna, se kterou se tabule spustí (po obnovení ze zálohy se změní)
  const [draft, setDraft] = useState<{ json: string; at: number } | null>(null);
  const retry = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dark, setDark] = useState(true);
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>(null);
  const last = useRef(initial);
  const mounted = useRef(false);

  useEffect(() => {
    (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
    const read = () => setDark(isDark());
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("classmate:theme", read);
    mq.addEventListener("change", read);
    return () => {
      window.removeEventListener("classmate:theme", read);
      mq.removeEventListener("change", read);
    };
  }, []);

  const data = useMemo(() => {
    if (!boot) return null;
    try {
      const j = JSON.parse(boot);
      return { elements: j.elements ?? [], appState: { ...(j.appState ?? {}) }, files: j.files ?? {}, scrollToContent: true };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot]);

  // záloha z tohoto prohlížeče, kterou se nepovedlo uložit na server
  useEffect(() => {
    if (readOnly || draftId === undefined) return;
    const d = loadBoardDraft(draftId);
    if (!d || d.json === initial) return;
    // prázdná tabule nebo stejné prvky jako na serveru: není co obnovovat
    const mine = boardElements(d.json);
    if (!mine.length || JSON.stringify(mine) === JSON.stringify(boardElements(initial))) {
      clearBoardDraft(draftId);
      return;
    }
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const json = latest.current;
    if (json === null || !onSave) return;
    if (json === last.current) {
      latest.current = null; // mezitím se scéna vrátila k uložené podobě, není co ukládat
      setState("saved");
      return;
    }
    latest.current = null;
    setState("saving");
    if (draftId !== undefined) saveBoardDraft(draftId, json);
    let err: string | void;
    try {
      err = await onSave(json);
    } catch {
      err = "Uložení tabule se nepovedlo, zkouším znovu.";
    }
    if (err) {
      latest.current = json;
      setState("error");
      if (err === "conflict") {
        setError("Tabule se změnila jinde, ukládání je pozastavené.");
      } else {
        setError(err);
        // opakování s rostoucími odstupy (výpadek sítě, server)
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flushRef2.current(), Math.min(30_000, 3_000 * 2 ** retry.current++));
      }
    } else {
      retry.current = 0;
      if (draftId !== undefined && latest.current === null) clearBoardDraft(draftId);
      last.current = json;
      setError("");
      // změna, která mezitím přišla, může být tatáž scéna jako právě uložená
      if (latest.current === json) latest.current = null;
      setState(latest.current === null ? "saved" : "dirty");
    }
  }, [onSave, draftId]);
  const flushRef2 = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    flushRef2.current = flush;
  }, [flush]);

  useEffect(() => {
    onStatus?.(state);
  }, [state, onStatus]);
  useEffect(() => {
    if (flushRef) flushRef.current = flush;
    return () => {
      if (flushRef) flushRef.current = null;
    };
  }, [flush, flushRef]);

  /** Celá obrazovka jen pro tabuli: překryv a, kde to jde, celá obrazovka prohlížeče. Esc ji ukončí. */
  const screenRef = useRef(false);
  const toggleFull = useCallback((on: boolean, screen = true) => {
    setFull(on);
    screenRef.current = on && screen;
    try {
      if (on && screen) void box.current?.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen();
    } catch {}
  }, []);
  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = "hidden";
    document.body.classList.add("note-full");
    const onFs = () => screenRef.current && !document.fullscreenElement && setFull(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !screenRef.current && !document.querySelector("dialog[open]") && setFull(false);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("note-full");
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  // nechat se varovat při zavření, dokud tabule není uložená; záloha se zapíše hned
  useEffect(() => {
    if (state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      if (draftId !== undefined && latest.current) saveBoardDraft(draftId, latest.current);
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state, draftId]);

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
      void flush();
    };
  }, [flush]);

  return (
    <div className="board-wrap">
      {draft && (
        <div className="note-alert" role="alert">
          <b>Našel jsem neuloženou tabuli z tohoto zařízení</b> ({new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(draft.at)}). Chceš ji obnovit?
          <span className="btn-row">
            <button type="button" className="btn small primary" onClick={() => { latest.current = draft.json; setBoot(draft.json); setState("dirty"); void flush(); setDraft(null); }}>Obnovit</button>
            <button type="button" className="btn small" onClick={() => { if (draftId !== undefined) clearBoardDraft(draftId); setDraft(null); }}>Zahodit</button>
          </span>
        </div>
      )}
      <div ref={box} className={`board-canvas${full ? " full" : ""}`}>
        <Excalidraw
          key={bootKey}
          initialData={data}
          theme={dark ? "dark" : "light"}
          langCode="cs-CZ"
          viewModeEnabled={readOnly}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
          onChange={(elements, appState, files) => {
            if (readOnly || !onSave) return;
            const live = elements.filter((e) => !e.isDeleted);
            const json = live.length ? serializeAsJSON(elements, appState, files, "local") : "";
            // první volání je jen načtení uložené scény; jeho zápis se bere jako základ, ať se tabule hned znovu neukládá
            if (!mounted.current) {
              mounted.current = true;
              if (initial) last.current = json;
              return;
            }
            if (json === last.current) return;
            latest.current = json;
            setState("dirty");
            if (draftId !== undefined) {
              if (draftTimer.current) clearTimeout(draftTimer.current);
              draftTimer.current = setTimeout(() => saveBoardDraft(draftId, json), 400); // záloha v prohlížeči
            }
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void flush(), 1500);
          }}
          renderTopRightUI={() => (
            <>
            {!full && (
              <button type="button" className="board-fs" aria-label="Roztáhnout tabuli v okně" title="Roztáhnout přes celé okno (bez celé obrazovky prohlížeče)" onClick={() => toggleFull(true, false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8v6H8z" /></svg>
              </button>
            )}
            <button type="button" className="board-fs" aria-label={full ? "Zavřít celou obrazovku" : "Tabule na celou obrazovku"} title={full ? "Zavřít celou obrazovku (Esc)" : "Celá obrazovka"} onClick={() => toggleFull(!full)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {full ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
              </svg>
            </button>
            </>
          )}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
      {state === "error" && error && <p className="msg-error" role="alert">{error}</p>}
    </div>
  );
}
