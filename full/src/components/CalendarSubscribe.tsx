"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { regenerateFeed, removeFeed, saveFeedKinds } from "@/app/actions/calendar";
import { Icon } from "./Icon";
import { SwitchRow } from "./SwitchRow";

type Kind = { id: string; label: string; hint: string };

/** Odběr kalendáře: tajný odkaz pro Google, Apple a Outlook, který se sám aktualizuje. */
export function CalendarSubscribe({ path, lastUsed, kinds, active }: { path: string | null; lastUsed: number | null; kinds: Kind[]; active: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [auto, setAuto] = useState(false);
  const [on, setOn] = useState(active);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const https = path && origin ? `${origin}${path}` : "";
  const webcal = https.replace(/^https?:/, "webcal:");
  const google = https ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : "";

  const copy = async (text = https) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  useEffect(() => {
    if (auto && https) {
      setAuto(false);
      void copy(https);
    }
  });

  const toggle = (id: string, v: boolean) => {
    const next = v ? [...on, id] : on.filter((k) => k !== id);
    setOn(next);
    if (path) start(() => saveFeedKinds(next));
  };
  const create = () =>
    start(async () => {
      await regenerateFeed();
      await saveFeedKinds(on);
      setAuto(true);
    });
  const close = () => setTimeout(() => ref.current?.close(), 150);

  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>
        <Icon name="link" size={15} /> Odebírat kalendář
      </button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="modal-card sub-card">
          <h2>Odebírat kalendář</h2>
          <p className="sub-lead">Termíny se ti samy objeví v Google, Apple nebo Outlook kalendáři a budou se aktualizovat. Vyber, co v něm chceš mít.</p>

          <div className="sub-kinds">
            {kinds.map((k) => (
              <SwitchRow key={k.id} label={k.label} hint={k.hint} checked={on.includes(k.id)} onChange={(v) => toggle(k.id, v)} />
            ))}
          </div>

          {!path ? (
            <button type="button" className="btn primary sub-create" disabled={pending || !on.length} onClick={create}>
              Vytvořit odkaz
            </button>
          ) : (
            <div className="sub-link">
              <div className="sub-url">
                <input readOnly value={https} aria-label="Tajný odkaz ke kalendáři" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn small" onClick={() => copy()}>
                  {copied ? "Zkopírováno" : "Kopírovat"}
                </button>
              </div>
              <div className="sub-apps">
                <a className="btn primary" href={webcal} onClick={close}>Apple / Outlook</a>
                <a className="btn" href={google} target="_blank" rel="noreferrer" onClick={close}>Google Kalendář</a>
              </div>
              <p className="hint">
                Odkaz je tajný, kdo ho má, vidí tvoje termíny. Kalendáře si ho obnovují samy, obvykle po několika hodinách (Google až po dni).
                {lastUsed ? ` Naposledy načten ${new Date(lastUsed).toLocaleString("cs-CZ")}.` : " Zatím ho nic nenačetlo."}
              </p>
              <div className="sub-danger">
                <button type="button" className="link-btn" disabled={pending} onClick={() => start(() => regenerateFeed().then(() => setAuto(true)))}>Obnovit odkaz</button>
                <button type="button" className="link-btn danger" disabled={pending} onClick={() => start(() => removeFeed())}>Zrušit odběr</button>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Zavřít</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
