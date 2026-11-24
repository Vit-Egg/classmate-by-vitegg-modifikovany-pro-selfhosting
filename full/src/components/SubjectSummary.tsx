"use client";

import { useCallback, useEffect, useState } from "react";
import { savePref } from "@/app/actions/settings";
import { Sk as Skeleton } from "./Skeleton";

type State = { s: "consent" } | { s: "loading" } | { s: "ready"; text: string; at: number; stale: boolean } | { s: "error"; rate?: boolean };

const time = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "numeric", minute: "2-digit" }).format(ms);
const hourNow = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(Date.now()));

/** Shrnutí předmětu. Vytvoří se při otevření stránky (jednou za půlden, dělí poledne) a zůstane uložené. */
export function SubjectSummary({ subjectId, consented }: { subjectId: number; consented: boolean }) {
  const [state, setState] = useState<State>(consented ? { s: "loading" } : { s: "consent" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ s: "loading" });
    try {
      const res = await fetch(`/api/predmety/${subjectId}/souhrn`, { signal });
      if (!res.ok) return setState({ s: "error", rate: res.status === 429 });
      const j = (await res.json()) as { text: string; createdAt: number; stale: boolean };
      setState({ s: "ready", text: j.text, at: j.createdAt, stale: j.stale });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState({ s: "error" });
    }
  }, [subjectId]);

  useEffect(() => {
    if (!consented) return;
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [consented, load]);

  const enable = async () => {
    setState({ s: "loading" });
    await savePref("ai_sum", "1");
    load();
  };

  return (
    <section className="summary">
      <div className="section-head"><h2 className="section">Shrnutí</h2></div>
      <div className="card card-pad" aria-live="polite" aria-busy={state.s === "loading"}>
        {state.s === "consent" && (
          <div className="sum-consent">
            <p>Shrnutí předmětu sestaví ze známek, témat hodin, testů a zkoušení, úkolů a tvých poznámek přehled, kde právě jsi. Vytvoří se při otevření předmětu a platí do poledne, popřípadě do půlnoci.</p>
            <p className="hint">Podklady (bez jména; zahrnují i položky „jen pro mě“) se k tomu odešlou do služby Google Gemini. Na bezplatné úrovni je Google smí využívat k vylepšování svých služeb, proto to nezapínej, pokud ve svých poznámkách máš něco, co by tam jít nemělo. Vypnout to půjde kdykoli v Nastavení.</p>
            <button type="button" className="btn primary" onClick={enable}>Zapnout shrnutí</button>
          </div>
        )}
        {state.s === "loading" && (
          <div className="sum-loading" role="status" aria-label="Shrnutí se připravuje">
            <Skeleton w="92%" h={14} r={6} />
            <Skeleton w="100%" h={14} r={6} />
            <Skeleton w="78%" h={14} r={6} />
            <Skeleton w="88%" h={14} r={6} />
            <small className="hint">Shrnutí se připravuje, chvilku to trvá…</small>
          </div>
        )}
        {state.s === "ready" && (
          <>
            <div className="sum-body">{render(state.text)}</div>
            <p className="hint sum-foot">
              {state.stale ? `Nové shrnutí se teď nepovedlo, tohle je z ${time(state.at)}.` : `Vytvořeno v ${time(state.at)}`}
              {!state.stale && ` · další aktualizace ${hourNow() < 12 ? "po 12:00" : "po půlnoci"}`}
            </p>
          </>
        )}
        {state.s === "error" && (
          <div className="sum-consent">
            <p>{state.rate ? "Shrnutí sis dnes vyžádal moc často, zkus to za chvíli." : "Shrnutí se teď nepodařilo vytvořit."}</p>
            <button type="button" className="btn" onClick={() => load()}>Zkusit znovu</button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Odstavce a odrážky („- “); nic jiného se nevykresluje, takže odpověď modelu nemůže vložit značky. */
function render(text: string) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/\*\*/g, "");
    if (!line) continue;
    const m = /^[-*•]\s+(.*)$/.exec(line);
    if (m) list.push(m[1]);
    else {
      flush();
      out.push(<p key={`p${out.length}`}>{line}</p>);
    }
  }
  flush();
  return out;
}
