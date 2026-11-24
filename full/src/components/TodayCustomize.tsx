"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { savePref } from "@/app/actions/settings";
import { WIDGETS, defaultLayout, serializeLayout, type Col, type LayoutItem } from "@/lib/today";
import { Icon } from "./Icon";

const label = (id: string) => WIDGETS.find((w) => w.id === id)?.label ?? id;

/** Úprava stránky Dnes: co se ukazuje, v jakém pořadí a ve kterém sloupci. Panely, které nejsou k dispozici (třeba Oběd bez Strava.cz), se nenabízejí. */
export function TodayCustomize({ initial, available }: { initial: LayoutItem[]; available: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  // odkaz z příkazové palety (/dnes?upravit=1) otevře úpravu rovnou
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("upravit") !== "1") return;
    p.delete("upravit");
    history.replaceState(null, "", `${location.pathname}${p.size ? `?${p}` : ""}`);
    ref.current?.showModal();
  }, []);

  const shown = items.filter((i) => available.includes(i.id));
  const move = (id: string, dir: -1 | 1) =>
    setItems((l) => {
      const vis = l.filter((x) => available.includes(x.id));
      const k = vis.findIndex((x) => x.id === id);
      const t = k + dir;
      if (k < 0 || t < 0 || t >= vis.length) return l;
      const a = l.findIndex((x) => x.id === id);
      const b = l.findIndex((x) => x.id === vis[t].id);
      const next = [...l];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  const setCol = (id: string, col: Col) => setItems((l) => l.map((x) => (x.id === id ? { ...x, col: col === "h" ? "h" : col } : x)));

  const save = async (value: LayoutItem[]) => {
    setBusy(true);
    try {
      await savePref("today_layout", serializeLayout(value));
      router.refresh();
      ref.current?.close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn small ghost today-edit" onClick={() => { setItems(initial); ref.current?.showModal(); }}>
        <Icon name="settings" size={15} /> Upravit stránku
      </button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>Upravit stránku Dnes</h2>
          <p className="hint" style={{ margin: "4px 0 14px" }}>Vyber, co chceš vidět, v jakém pořadí a ve kterém sloupci. Platí jen pro tvůj účet.</p>
          <div className="today-list">
            {shown.map((i, k) => (
              <div key={i.id} className={`today-row${i.col === "h" ? " off" : ""}`}>
                <div className="today-move">
                  <button type="button" className="icon-btn" aria-label={`${label(i.id)} výš`} disabled={k === 0} onClick={() => move(i.id, -1)}><Icon name="chevron" size={14} /></button>
                  <button type="button" className="icon-btn down" aria-label={`${label(i.id)} níž`} disabled={k === shown.length - 1} onClick={() => move(i.id, 1)}><Icon name="chevron" size={14} /></button>
                </div>
                <b>{label(i.id)}</b>
                {i.id === "r" ? (
                  <div className="seg small" role="group" aria-label={label(i.id)}>
                    <button type="button" aria-pressed={i.col !== "h"} onClick={() => setCol(i.id, "l")}>Ukázat</button>
                    <button type="button" aria-pressed={i.col === "h"} onClick={() => setCol(i.id, "h")}>Skrýt</button>
                  </div>
                ) : (
                  <div className="seg small" role="group" aria-label={`${label(i.id)}: sloupec`}>
                    <button type="button" aria-pressed={i.col === "l"} onClick={() => setCol(i.id, "l")}>Vlevo</button>
                    <button type="button" aria-pressed={i.col === "r"} onClick={() => setCol(i.id, "r")}>Vpravo</button>
                    <button type="button" aria-pressed={i.col === "h"} onClick={() => setCol(i.id, "h")}>Skrýt</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 18, justifyContent: "space-between" }}>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setItems(defaultLayout())}>Výchozí vzhled</button>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => save(items)}>{busy ? "Ukládám…" : "Uložit"}</button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
