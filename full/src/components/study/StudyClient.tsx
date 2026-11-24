"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Progress, StudyState } from "@/lib/study";
import { Icon } from "../Icon";
import { StudyCards } from "./StudyCards";
import { StudyQuiz } from "./StudyQuiz";
import { StudyChat } from "./StudyChat";
import { StudySummary } from "./StudySummary";

type Loaded = StudyState & { progress?: Progress };
type View = Loaded | { state: "loading" } | { state: "error"; why: "failed" | "rate" | "no_input" | "network" };
type Tab = "summary" | "cards" | "quiz";

const STEPS = [
  { icon: "file", label: "Souhrn látky", text: "Píšu souhrn látky…" },
  { icon: "pen", label: "Kartičky", text: "Připravuju kartičky…" },
  { icon: "check", label: "Procvičování", text: "Sestavuju otázky k procvičení…" },
];

const ERRORS = {
  failed: "Sadu se nepodařilo vytvořit, nic se neuložilo. Zkus to prosím znovu.",
  rate: "Sadu sis vyžádal moc často, zkus to za chvíli.",
  no_input: "Není z čeho sadu sestavit. Doplň k testu nebo zkoušení zadání, nebo počkej, až spolužáci nasdílejí poznámky.",
  network: "Spojení se nepovedlo, zkus to znovu.",
};

const dateShort = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);

const Steps = ({ step }: { step: number }) => (
  <ol className="study-stepper">
    {STEPS.map((s, i) => (
      <li key={s.label} className={i < step ? "done" : i === step ? "now" : ""}>
        <span>{i < step ? <Icon name="tick" size={16} /> : <Icon name={s.icon} size={16} />}</span>
        {s.label}
      </li>
    ))}
  </ol>
);

const Tile = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
  <div className="study-tile">
    <span><Icon name={icon} size={18} /></span>
    <b>{title}</b>
    <small>{text}</small>
  </div>
);

export function StudyClient({ testId, initial, progress: initialProgress, canStart, noteCount, when, subject, testLine, chatProvider }: { testId: number; initial: StudyState; progress: Progress; canStart: boolean; noteCount: number; when: string; subject: string; testLine: string; chatProvider: string }) {
  const [view, setView] = useState<View>(initial);
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const createdAt = useRef(initial.state === "ready" ? initial.createdAt : 0);
  const wasRegen = useRef(initial.state === "ready" && initial.regenerating);
  const wasGenerating = useRef(initial.state === "generating");

  const apply = useCallback((s: Loaded) => {
    if (s.progress) setProgress(s.progress);
    if (s.state === "ready") {
      if (wasRegen.current && !s.regenerating) {
        // Přegenerování skončilo: buď je sada nová (jiný čas vytvoření), nebo se nepovedlo a zůstala původní.
        setNotice(s.createdAt !== createdAt.current ? "Sada je přegenerovaná z aktuálních podkladů. Tvůj postup se vynuloval." : "Přegenerování se nepovedlo, zůstává původní sada.");
      }
      wasRegen.current = s.regenerating;
      createdAt.current = s.createdAt;
      wasGenerating.current = false;
    }
    if (s.state === "generating") wasGenerating.current = true;
    // Rozjetá sada, která zmizela, znamená, že se vytvoření nepovedlo (a nic se neuložilo).
    if (s.state === "none" && wasGenerating.current) {
      wasGenerating.current = false;
      setView({ state: "error", why: "failed" });
    } else setView(s);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/studium/${testId}`, { cache: "no-store" });
      if (res.ok) apply((await res.json()) as Loaded);
    } catch {}
  }, [testId, apply]);

  useEffect(() => {
    if (!(view.state === "generating" || (view.state === "ready" && view.regenerating))) return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [view, poll]);

  // Postup se ukládá k účtu; změny se slučují, ať se nezahlcuje server.
  const pending = useRef<{ known?: number[]; quiz?: { right: number; total: number } }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    pending.current = {};
    if (!body.known && !body.quiz) return;
    fetch(`/api/studium/${testId}/postup`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {
      pending.current = { ...body, ...pending.current }; // při výpadku se zkusí příště
    });
  }, [testId]);
  const save = useCallback((patch: { known?: number[]; quiz?: { right: number; total: number } }) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }, [flush]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);

  const post = async (regenerate: boolean) => {
    setNotice(null);
    if (!regenerate) setView({ state: "loading" });
    try {
      const res = await fetch(`/api/studium/${testId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regenerate }) });
      if (res.status === 429) return regenerate ? setNotice(ERRORS.rate) : setView({ state: "error", why: "rate" });
      if (res.status === 422) return setView({ state: "error", why: "no_input" });
      if (!res.ok) return regenerate ? setNotice(ERRORS.network) : setView({ state: "error", why: "network" });
      apply((await res.json()) as Loaded);
    } catch {
      if (regenerate) setNotice(ERRORS.network);
      else setView({ state: "error", why: "network" });
    }
  };
  const regenerate = () => {
    if (!window.confirm("Přegenerovat celou sadu z aktuálních podkladů? Postup všech se vynuluje. Stará sada zůstane k dispozici, dokud nová není hotová.")) return;
    void post(true);
  };

  if (view.state === "ready") {
    const known = progress.known.filter((i) => i < view.cards.length).length;
    const tabs: [Tab, string, string][] = [["summary", "Souhrn", "file"], ["cards", `Kartičky (${view.cards.length})`, "pen"], ["quiz", `Procvičování (${view.quiz.length})`, "check"]];
    const last = progress.quizRight != null && progress.quizTotal ? { right: progress.quizRight, total: progress.quizTotal, best: progress.quizBest ?? 0 } : null;
    return (
      <>
        <div className="stat-row">
          <div className="stat"><small>Test nebo zkoušení</small><b>{when}</b></div>
          <div className="stat"><small>Kartičky</small><b>{known} z {view.cards.length}</b></div>
          <div className="stat"><small>Procvičování</small><b>{last ? `${last.best} %` : "–"}</b></div>
          <div className="stat"><small>Sada z</small><b>{dateShort(view.createdAt)}</b></div>
        </div>
        {view.regenerating && (
          <div className="card study-banner" role="status" aria-live="polite">
            <div><b>Sada se přegenerovává…</b><small>Zatím můžeš používat původní, nahradí se, až bude nová celá hotová.</small></div>
            <Steps step={view.step} />
          </div>
        )}
        {!view.regenerating && view.stale && (
          <div className="card study-banner warn">
            <div><b>Podklady se od vytvoření sady změnily</b><small>Zadání nebo sdílené poznámky jsou jiné, sada už nemusí sedět.</small></div>
            <button type="button" className="btn primary" onClick={regenerate}>Přegenerovat sadu</button>
          </div>
        )}
        {notice && <p className="msg-ok" role="status" style={{ margin: "0 2px 16px" }}>{notice}</p>}
        <div className="toolbar">
          <nav className="seg" aria-label="Část sady">
            {tabs.map(([k, label, icon]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}><Icon name={icon} size={16} />{label}</button>)}
          </nav>
        </div>
        {tab === "summary" && (
          <>
            <StudySummary text={view.summary} />
            <StudyChat context={{ subject, testLine, summary: view.summary, cards: view.cards }} initialProvider={chatProvider} />
          </>
        )}
        {tab === "cards" && <StudyCards key={view.createdAt} cards={view.cards} initialKnown={progress.known} onChange={(k) => { setProgress((p) => ({ ...p, known: k })); save({ known: k }); }} />}
        {tab === "quiz" && <StudyQuiz key={view.createdAt} quiz={view.quiz} last={last} onFinish={(right, total) => { setProgress((p) => ({ ...p, quizRight: right, quizTotal: total, quizBest: Math.max(p.quizBest ?? 0, Math.round((right / total) * 100)) })); save({ quiz: { right, total } }); }} />}
        <p className="study-foot">
          Sadu sestavila umělá inteligence ze zadání a ze sdílených poznámek spolužáků, tak si důležité věci ověř. Je společná pro všechny, komu to platí, a po termínu se sama smaže.
          {!view.regenerating && <> <button type="button" className="link-all" onClick={regenerate}>Přegenerovat sadu</button></>}
        </p>
      </>
    );
  }

  if (view.state === "generating" || view.state === "loading") {
    const step = view.state === "generating" ? view.step : 0;
    return (
      <div className="card study-hero" role="status" aria-live="polite">
        <div className="study-hero-ic working"><Icon name="cap" size={26} /></div>
        <h2>{STEPS[Math.min(step, 2)].text}</h2>
        <Steps step={step} />
        <div className="study-progress wide" aria-hidden><span style={{ width: `${Math.max(8, ((step + 0.5) / 3) * 100)}%` }} /></div>
        <p>Trvá to asi minutu. Stránku můžeš opustit, sada se dokončí i bez tebe a pak bude hotová pro všechny.</p>
      </div>
    );
  }

  const error = view.state === "error" ? view.why : null;
  return (
    <div className="card study-hero">
      <div className="study-hero-ic"><Icon name="cap" size={26} /></div>
      {error && <p className="msg-error" role="alert" style={{ margin: 0 }}>{ERRORS[error]}</p>}
      <h2>Sada k tomuto testu nebo zkoušení ještě není</h2>
      <p>Vytvoř ji a souhrn, kartičky i procvičování pak uvidí všichni, komu to platí.</p>
      <div className="study-tiles">
        <Tile icon="file" title="Souhrn látky" text="Přehledně po oddílech, s tím, na co si dát pozor" />
        <Tile icon="pen" title="Kartičky" text="Otázka a odpověď, pamatuje si, co už umíš" />
        <Tile icon="check" title="Procvičování" text="Výběr správné odpovědi s vysvětlením" />
      </div>
      {canStart ? (
        <>
          <button type="button" className="btn primary" onClick={() => post(false)}>{error === "failed" ? "Zkusit znovu" : "Vytvořit studijní sadu"}</button>
          <small className="study-src">{noteCount ? `Vychází ze zadání a ${noteCount === 1 ? "1 sdílené poznámky" : `${noteCount} sdílených poznámek`} spolužáků` : "Vychází ze zadání"}</small>
        </>
      ) : (
        <small className="study-src">Tenhle termín nemá zadání ani sdílené poznámky, není z čeho sadu sestavit.</small>
      )}
    </div>
  );
}
