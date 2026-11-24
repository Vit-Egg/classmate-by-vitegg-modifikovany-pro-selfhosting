"use client";

import { useCallback, useEffect, useState } from "react";
import type { Question } from "@/lib/study";
import { Rich } from "./Rich";

const LETTERS = ["A", "B", "C", "D"];

/** Procvičování s výběrem odpovědi: po výběru se hned ukáže správná s vysvětlením, na konci výsledek a rozbor chyb. */
export function StudyQuiz({ quiz, last, onFinish }: { quiz: Question[]; last: { right: number; total: number; best: number } | null; onFinish: (right: number, total: number) => void }) {
  const [list, setList] = useState<number[]>(() => quiz.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ q: number; picked: number }[]>([]);
  const [right, setRight] = useState(0);
  const done = pos >= list.length;

  const pick = useCallback((i: number) => {
    if (picked != null || done) return;
    setPicked(i);
    const idx = list[pos];
    if (i === quiz[idx].correct) setRight((r) => r + 1);
    else setWrong((w) => [...w, { q: idx, picked: i }]);
  }, [picked, done, list, pos, quiz]);

  const next = useCallback(() => {
    if (picked == null) return;
    setPicked(null);
    setPos((p) => p + 1);
    if (pos + 1 >= list.length && list.length === quiz.length) onFinish(right, list.length); // do postupu se počítá jen celé kolo
  }, [picked, pos, list.length, quiz.length, right, onFinish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-4]$/.test(e.key)) pick(Number(e.key) - 1);
      else if (/^[a-dA-D]$/.test(e.key)) pick("abcd".indexOf(e.key.toLowerCase()));
      else if (e.key === "Enter" && picked != null && !t?.closest("a, .study-actions")) {
        e.preventDefault();
        next();
      } else return;
      e.stopImmediatePropagation(); // klávesy procvičování mají přednost před globálními zkratkami
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pick, next, picked]);

  const restart = (ids: number[]) => {
    setList(ids);
    setPos(0);
    setPicked(null);
    setWrong([]);
    setRight(0);
  };

  if (done) {
    const pct = Math.round((right / list.length) * 100);
    const msg = pct === 100 ? "Bez jediné chyby" : pct >= 80 ? "Skvělý výsledek" : pct >= 50 ? "Slušný základ" : "Ještě to chce procvičit";
    return (
      <div className="study-result">
        <div className="card study-done">
          <div className="study-ring big" style={{ ["--pct" as string]: `${pct}%` }}><b>{pct} %</b></div>
          <h3>{msg}</h3>
          <p>{right} z {list.length} správně{wrong.length ? `, ${wrong.length} ${wrong.length === 1 ? "chyba" : wrong.length < 5 ? "chyby" : "chyb"} k projití` : ""}</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            {wrong.length > 0 && <button type="button" className="btn primary" onClick={() => restart(wrong.map((w) => w.q))}>Projít chyby znovu</button>}
            <button type="button" className={wrong.length ? "btn" : "btn primary"} onClick={() => restart(quiz.map((_, i) => i))}>Znovu všechno</button>
          </div>
        </div>
        {wrong.length > 0 && (
          <section>
            <h2 className="group-title">Rozbor chyb</h2>
            <div className="card rows">
              {wrong.map((w) => {
                const q = quiz[w.q];
                return (
                  <div key={w.q} className="study-review">
                    <b><Rich text={q.q} /></b>
                    <span className="bad"><i>Tvoje odpověď</i><em><Rich text={q.options[w.picked]} /></em></span>
                    <span className="good"><i>Správně</i><em><Rich text={q.options[q.correct]} /></em></span>
                    {q.why && <small><Rich text={q.why} /></small>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  const q = quiz[list[pos]];
  return (
    <div className="study-split">
      <div className="study-main">
        <div className="card study-qcard">
          <div className="study-qtop"><b>Otázka {pos + 1} z {list.length}</b><div className="study-progress" aria-hidden><span style={{ width: `${(pos / list.length) * 100}%` }} /></div></div>
          <h3 className="study-q"><Rich text={q.q} /></h3>
          <div className="study-options" role="group" aria-label="Možnosti">
            {q.options.map((o, i) => {
              const state = picked == null ? "" : i === q.correct ? " correct" : i === picked ? " wrong" : " dim";
              return (
                <button key={i} type="button" className={`study-opt${state}`} onClick={() => pick(i)} disabled={picked != null}>
                  <b>{LETTERS[i]}</b>
                  <span><Rich text={o} /></span>
                </button>
              );
            })}
          </div>
          {picked != null && (
            <div className={`study-why${picked === q.correct ? " ok" : " ko"}`} role="status">
              <b>{picked === q.correct ? "Správně" : "Tohle ne"}</b>
              {q.why && <span><Rich text={q.why} /></span>}
            </div>
          )}
        </div>
        <div className="study-actions end">
          <button type="button" className="btn primary" onClick={next} disabled={picked == null}>{pos + 1 === list.length ? "Zobrazit výsledek" : "Další otázka"}</button>
        </div>
      </div>
      <aside className="study-side card card-pad">
        <dl className="study-facts">
          <div><dt>Správně</dt><dd className="ok">{right}</dd></div>
          <div><dt>Chybně</dt><dd className={wrong.length ? "ko" : ""}>{wrong.length}</dd></div>
          <div><dt>Zbývá</dt><dd>{list.length - pos - (picked != null ? 1 : 0)}</dd></div>
        </dl>
        {last && <p className="study-last">Naposledy {last.right} z {last.total}, nejlépe {last.best} %</p>}
        <p className="study-keys"><span><kbd>1</kbd>–<kbd>4</kbd> vybrat odpověď</span><span><kbd>Enter</kbd> další otázka</span></p>
      </aside>
    </div>
  );
}
