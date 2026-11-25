"use client";
import { ITEM_LABEL } from "@/lib/lessonitems";

import { SELF_STUDY_HINT } from "@/lib/selfstudy";
import { confetti } from "@/lib/confetti";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pragueClock, pragueNow } from "@/lib/dates";

type H = { hour: number; begin: number; end: number };
export type LessonDetail = {
  subject: string;
  when: string; // „Čtvrtek 22. 10. · 3. hodina · 10:00–10:45“
  theme?: string;
  /** testy, zkoušení a úkoly svázané s tímto dnem a předmětem */
  items?: { kind: "test" | "oral" | "task"; text: string }[];
  room?: string;
  /** samostudium: student může být doma */
  selfStudy?: boolean;
  /** celodenní událost (nahrazuje všechny hodiny dne) */
  allDay?: boolean;
  /** hodiny, které by ten den jinak byly (jen u celodenní události) */
  lessons?: string[];
  teacher?: string;
  groups?: string;
  cycle?: string;
  change?: { label: string; text?: string; cancelled: boolean };
  hue: string;
  isCurrent?: boolean;
};

/**
 * Nad rozvrhem:
 *  – právě probíhající hodina má pulzující tečku,
 *  – najetí zvýrazní konkrétní hodinu, ostatní hodiny stejného předmětu jen jemně a zbytek ztlumí,
 *  – kliknutí otevře podrobnosti hodiny (včetně tématu z Bakalářů).
 */
export function TimetableFx({ hours, live, details, openKey, children }: { hours: H[]; live: boolean; details: Record<string, LessonDetail>; openKey?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mark = () => {
      el.querySelectorAll(".is-now").forEach((n) => n.classList.remove("is-now"));
      if (!live) return;
      const now = pragueClock();
      const h = hours.find((x) => now >= x.begin && now < x.end);
      if (h) el.querySelectorAll(`.lesson:not(.cancelled)[data-day="${pragueNow().dow}"][data-hour="${h.hour}"]`).forEach((n) => n.classList.add("is-now"));
    };
    // čára „teď“: uvnitř právě probíhající hodiny podle času, o přestávce na hraně mezi hodinami
    const line = () => {
      el.querySelectorAll(".now-line").forEach((n) => n.remove());
      if (!live) return;
      const now = pragueClock();
      const dow = pragueNow().dow;
      const vertical = !!el.querySelector(".tt.v");
      const put = (hour: number, frac: number) => {
        el.querySelectorAll<HTMLElement>(`.tt-cell[data-day="${dow}"][data-hour="${hour}"], .mday-row[data-day="${dow}"][data-hour="${hour}"]`).forEach((c) => {
          const isRow = c.classList.contains("mday-row");
          const n = document.createElement("div");
          n.className = `now-line${vertical && !isRow ? " v" : ""}`;
          n.dataset.t = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          n.style[vertical && !isRow ? "left" : "top"] = `${Math.min(100, Math.max(0, frac * 100))}%`;
          c.appendChild(n);
        });
      };
      const cur = hours.find((x) => now >= x.begin && now < x.end);
      if (cur) return put(cur.hour, (now - cur.begin) / (cur.end - cur.begin));
      const prev = [...hours].reverse().find((x) => x.end <= now);
      const next = hours.find((x) => x.begin > now);
      if (prev && next) put(prev.hour, 1);
    };
    mark();
    line();
    const id = setInterval(() => { mark(); line(); }, 10_000);

    const clear = () => el.querySelectorAll(".dim, .hit, .self").forEach((n) => n.classList.remove("dim", "hit", "self"));
    const over = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".lesson[data-k]");
      clear();
      if (!target) return;
      const s = target.dataset.subject;
      el.querySelectorAll<HTMLElement>(".lesson").forEach((l) => {
        if (l === target) l.classList.add("self");
        else if (s && l.dataset.subject === s) l.classList.add("hit");
        else l.classList.add("dim");
      });
    };
    const click = (e: MouseEvent) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>(".lesson[data-k]")?.dataset.k;
      if (k) setOpen(k);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const k = (e.target as HTMLElement).closest<HTMLElement>(".lesson[data-k]")?.dataset.k;
      if (k) {
        e.preventDefault();
        setOpen(k);
      }
    };
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseleave", clear);
    el.addEventListener("click", click);
    el.addEventListener("keydown", key);
    return () => {
      clearInterval(id);
      el.querySelectorAll(".now-line").forEach((n) => n.remove());
      el.removeEventListener("mouseover", over);
      el.removeEventListener("mouseleave", clear);
      el.removeEventListener("click", click);
      el.removeEventListener("keydown", key);
    };
  }, [hours, live]);

  // odkaz odjinud (např. z Dnes) rozklikne konkrétní hodinu a z adresy se pak odstraní
  useEffect(() => {
    if (!openKey) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    window.history.replaceState(null, "", url);
    if (details[openKey]) setOpen(openKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  useEffect(() => {
    if (open && !dlg.current?.open) dlg.current?.showModal();
    // easter egg: zrušená hodina = konfety
    if (open && details[open]?.change?.cancelled && dlg.current) confetti(dlg.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const d = open ? details[open] : null;
  return (
    <div ref={root}>
      {children}
      <dialog ref={dlg} className="modal" onClose={() => setOpen(null)} onClick={(e) => e.target === dlg.current && dlg.current.close()}>
        {d && (
          <div className="modal-card detail-card" style={{ ["--hue" as string]: `var(--h-${d.hue})` }}>
            <div className="detail-top">
              <span className="dot" />
              <h2>{d.subject}</h2>
            </div>
            <p className="detail-when">{d.when}</p>
            {d.change && <div className={`detail-change${d.change.cancelled ? " danger" : ""}`}><b>{d.change.label}</b>{d.change.text && <span>{d.change.text}</span>}</div>}
            {d.selfStudy && <div className="detail-change info"><b>Samostudium</b><span>{SELF_STUDY_HINT}</span></div>}
            {d.items && d.items.length > 0 && (
              <ul className="detail-items">
                {d.items.map((it, i) => (
                  <li key={i} className={`di-${it.kind}`}><b>{ITEM_LABEL[it.kind]}</b><span>{it.text}</span></li>
                ))}
              </ul>
            )}
            <dl className="detail-list">
              {!d.allDay && (d.theme ? (
                <div className="theme"><dt>Téma hodiny</dt><dd>{d.theme}</dd></div>
              ) : (
                <div className="theme none"><dt>Téma hodiny</dt><dd>Zatím není zapsané.</dd></div>
              ))}
              {d.room && <div><dt>Učebna</dt><dd>{d.room}</dd></div>}
              {d.teacher && <div><dt>Učitel</dt><dd>{d.teacher}</dd></div>}
              {d.groups && <div><dt>Skupina</dt><dd>{d.groups}</dd></div>}
              {d.lessons && <div><dt>Hodiny tento den</dt><dd>{d.lessons.join(", ")}</dd></div>}
              {d.cycle && <div><dt>Týden</dt><dd>{d.cycle}</dd></div>}
            </dl>
            <div className="modal-actions">
              <button className="btn" onClick={() => dlg.current?.close()}>Zavřít</button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
