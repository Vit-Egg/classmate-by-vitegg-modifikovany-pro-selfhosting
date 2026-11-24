"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ActionForm, Submit } from "./forms";
import { SwitchRow } from "./SwitchRow";
import { removeEvent, saveEvent } from "@/app/actions/calendar";
import type { CalEvent, CalKind } from "@/lib/calendar";

const WD = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const KIND_LABEL: Record<CalKind, string> = { test: "Test a zkoušení", task: "Úkol", change: "Změna", event: "Událost", other: "Ostatní", mark: "Známka", absence: "Absence" };
const dow = (iso: string) => ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const longDate = (iso: string) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(Date.parse(iso + "T00:00:00Z"));
const relative = (iso: string, today: string) => {
  const n = Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  if (n === 0) return "dnes";
  if (n === 1) return "zítra";
  if (n === 2) return "pozítří";
  if (n < 0) return n === -1 ? "včera" : `před ${-n} dny`;
  if (n < 14) return `za ${n} ${n < 5 ? "dny" : "dní"}`;
  const w = Math.round(n / 7);
  return n < 60 ? `za ${w} ${w < 5 ? "týdny" : "týdnů"}` : `za ${Math.round(n / 30)} měs.`;
};

export function CalendarView({ events, view, gridFrom, weeks, month, today }: { events: CalEvent[]; view: "m" | "a"; gridFrom: string; weeks: number; month: string; today: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  /** formulář vlastní události: id = úprava, bez id = nová */
  const [form, setForm] = useState<{ id?: number; title: string; start: string; end: string; note: string } | null>(null);
  const [pending, start] = useTransition();
  const [priv, setPriv] = useState(false);
  const by = new Map<string, CalEvent[]>();
  for (const e of events) by.set(e.date, [...(by.get(e.date) ?? []), e]);

  const open = (d: string) => {
    setSel(d);
    setForm(null);
    queueMicrotask(() => dlg.current?.showModal());
  };

  const item = (e: CalEvent, i: number) => {
    const inner = (
      <>
        <i className="cal-bar" />
        <span className="cal-item-main">
          <b>{e.title}</b>
          {(e.sub || e.time) && <small>{[e.time, e.sub].filter(Boolean).join(" · ")}</small>}
        </span>
        <span className="cal-kind">{KIND_LABEL[e.kind]}</span>
      </>
    );
    const cls = `cal-item k-${e.kind}${e.done ? " done" : ""}${e.cancelled ? " cancelled" : ""}${e.past ? " past" : ""}`;
    // vlastní události se upravují přímo tady, ostatní vedou na svou stránku
    return e.kind === "other" && e.editable ? (
      <button key={i} type="button" className={cls} onClick={() => setForm({ id: e.id, title: e.title, start: e.start ?? "", end: e.end ?? "", note: e.note ?? "" })}>
        {inner}
      </button>
    ) : (
      <Link key={i} href={e.href} className={cls}>
        {inner}
      </Link>
    );
  };

  const dialog = (
    <dialog ref={dlg} className="modal" onClose={() => { setSel(null); setForm(null); }} onClick={(e) => e.target === dlg.current && dlg.current.close()}>
      {sel && (
        <div className="modal-card cal-day">
          <h2>{longDate(sel)}</h2>
          {form ? (
            <ActionForm key={form.id ?? "new"} action={saveEvent} onSuccess={() => setForm(null)}>
              <h3 className="cal-form-title">{form.id ? "Upravit událost" : "Nová událost"}</h3>
              {form.id && <input type="hidden" name="id" value={form.id} />}
              <input type="hidden" name="date" value={sel} />
              <label className="field">
                <span>Název</span>
                <input className="input" name="title" required maxLength={120} autoComplete="off" autoFocus defaultValue={form.title} placeholder="např. Zubař, trénink, rodinná oslava" />
              </label>
              <div className="time-row">
                <label className="field">
                  <span>Od</span>
                  <input className="input" type="time" name="start" defaultValue={form.start} />
                </label>
                <label className="field">
                  <span>Do</span>
                  <input className="input" type="time" name="end" defaultValue={form.end} />
                </label>
              </div>
              <label className="field">
                <span>Poznámka</span>
                <textarea className="textarea" name="note" rows={3} maxLength={1000} defaultValue={form.note} />
              </label>
              {!form.id && <SwitchRow label="Jen pro mě" hint="Uvidíš ji jen ty a spolužáci nedostanou zprávu" checked={priv} onChange={setPriv} name="private" value="1" />}
              <p className="hint" style={{ margin: "0 0 4px" }}>{priv ? "Událost uvidíš jen ty." : "Událost uvidí celá třída (třeba školní akce nebo výlet)."} Čas je volitelný, bez něj je to událost na celý den.</p>
              <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                {form.id ? (
                  <button type="button" className="btn danger" disabled={pending} onClick={() => start(async () => { await removeEvent(form.id!); setForm(null); })}>Smazat</button>
                ) : (
                  <span />
                )}
                <span style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn" onClick={() => setForm(null)}>Zpět</button>
                  <Submit>Uložit</Submit>
                </span>
              </div>
            </ActionForm>
          ) : (
            <>
              <div className="cal-day-list">
                {(by.get(sel) ?? []).length ? (by.get(sel) ?? []).map(item) : <p className="msg-empty" style={{ padding: "8px 0 14px" }}>V tento den nic nemáš.</p>}
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <Link className="btn small" href={`/testy-a-zkouseni?new=1&date=${sel}`}>+ Test nebo zkoušení</Link>
                <Link className="btn small" href={`/ukoly?new=1&due=${sel}`}>+ Úkol</Link>
                <button className="btn small" onClick={() => (setPriv(false), setForm({ title: "", start: "", end: "", note: "" }))}>+ Událost</button>
                <button className="btn small" style={{ marginLeft: "auto" }} onClick={() => dlg.current?.close()}>Zavřít</button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );

  if (view === "a") {
    const days = [...by.keys()].sort();
    return (
      <>
        {days.length ? (
          <div className="stack-lg">
            {days.map((d) => (
              <section key={d}>
                <h2 className={`group-title cal-group${d === today ? " today" : ""}`}>
                  <span>{longDate(d).replace(/ \d{4}$/, "")}</span>
                  <small>{relative(d, today)}</small>
                </h2>
                <div className="card rows">{by.get(d)!.map(item)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty">V následujících týdnech tě nic nečeká.</div>
        )}
        {dialog}
      </>
    );
  }

  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridFrom, i));
  return (
    <>
      <div className="cal-grid" role="grid" aria-label="Měsíc">
        {WD.map((w) => (
          <div key={w} className="cal-wd" role="columnheader">{w}</div>
        ))}
        {cells.map((d) => {
          const list = by.get(d) ?? [];
          const kinds = [...new Set(list.map((e) => e.kind))];
          return (
            <button key={d} role="gridcell" className={`cal-cell${d === today ? " today" : ""}${d.slice(0, 7) !== month ? " other" : ""}${dow(d) > 5 ? " weekend" : ""}`} onClick={() => open(d)} aria-label={`${longDate(d)}, ${list.length ? list.length + " položek" : "nic"}`}>
              <span className="cal-num">{Number(d.slice(8))}</span>
              <span className="cal-pills">
                {list.slice(0, 3).map((e, i) => (
                  <span key={i} className={`cal-pill k-${e.kind}${e.done ? " done" : ""}${e.cancelled ? " cancelled" : ""}${e.past ? " past" : ""}`} title={e.title}>{e.title}</span>
                ))}
                {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
              </span>
              {kinds.length > 0 && (
                <span className="cal-dots" aria-hidden>
                  {kinds.slice(0, 5).map((k) => <i key={k} className={`k-${k}`} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint cal-hint">Klikni na den pro podrobnosti. Změny v rozvrhu a svátky se berou z Bakalářů asi 10 týdnů zpět a 5 měsíců dopředu.</p>
      {dialog}
    </>
  );
}
