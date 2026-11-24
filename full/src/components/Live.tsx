"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pragueClock, plural, inTime, midSentence } from "@/lib/dates";
import { dayState, fmtMin, type Slot } from "@/lib/schedule";
import { SELF_STUDY } from "@/lib/selfstudy";
import { BellFullButton } from "./BellScreen";
import { tickAligned } from "@/lib/ticker";

/** Živý čas v minutách (z hodin zařízení), nebo null před hydratací (ať se server a klient neliší). Tiká přesně na hranicích vteřin, takže se text mění rovnoměrně. */
function useNow(interval = 1000) {
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();
  useEffect(() => {
    let prev: number | null = null;
    const stop = tickAligned(() => {
      const n = pragueClock();
      // přes půlnoc se rozvrh dne načte znovu (jinak by ukazoval včerejšek)
      if (prev != null && n < prev - 60) router.refresh();
      prev = n;
      setNow(n);
    }, interval);
    return stop;
  }, [interval, router]);
  return now;
}

const min = (n: number, secs: number) => (secs < 60 ? `${Math.max(1, secs)} ${plural(Math.max(1, secs), "vteřina", "vteřiny", "vteřin")}` : `${n} ${plural(n, "minuta", "minuty", "minut")}`); // 1. pád: „Přestávka · 1 minuta“
const ms = midSentence;

/** Malé zvonění v postranním panelu: kolik zbývá do konce hodiny / přestávky. */
export function BellWidget({ slots, big }: { slots: Slot[]; big?: boolean }) {
  const now = useNow();
  if (now == null || !slots.length) return null;
  const s = dayState(slots, now);
  if (s.kind === "none") return null;
  let title = "";
  let sub = "";
  let progress = 0;
  if (s.kind === "home") [title, sub] = [SELF_STUDY, "Dnes můžeš být doma"];
  else if (s.kind === "in") [title, sub, progress] = s.slot.selfStudy ? [`${SELF_STUDY} · ${min(s.left, s.secs)}`, `Můžeš být doma · ${s.slot.subject}`, s.progress] : [`Zvonění ${inTime(s.left, s.secs)}`, s.slot.subject, s.progress];
  else if (s.kind === "break") [title, sub] = [`Přestávka · ${min(s.minutes, s.secs)}`, s.next.selfStudy ? `Pak samostudium: ${s.next.subject}` : `Pak ${ms(s.next.subject)}${s.next.room ? ` · ${s.next.room}` : ""}`];
  else if (s.kind === "before") [title, sub] = [s.home ? `${SELF_STUDY}, doma` : s.minutes <= 90 ? `Škola ${inTime(s.minutes, s.secs)}` : `Škola od ${fmtMin(s.first.begin)}`, s.home ? `Do školy až na ${fmtMin(s.first.begin)} · ${s.first.subject}` : `${s.first.subject}${s.first.room ? ` · ${s.first.room}` : ""}`];
  else [title, sub] = ["Po škole", `Končil jsi v ${fmtMin(s.last.end)}`];
  return (
    <div className={big ? "bell big" : "bell"} aria-live="off">
      <div className="bell-title">{title}</div>
      <div className="bell-sub">{sub}</div>
      {s.kind === "in" && (
        <div className="bell-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Věta pod nadpisem na „Dnes“ + čas ve štítku prohlížeče. */
export function DayLine({ slots }: { slots: Slot[] }) {
  const now = useNow();
  const s = now == null ? null : dayState(slots, now);

  useEffect(() => {
    const base = document.title;
    if (s?.kind === "in") document.title = `Classmate · ${s.slot.selfStudy ? "Samostudium · " : ""}${s.slot.subject} · ${s.secs < 60 ? `${s.secs} s` : `${s.left} min`}`;
    else if (s?.kind === "break") document.title = `Classmate · Přestávka · ${s.secs < 60 ? `${s.secs} s` : `${s.minutes} min`}`;
    return () => {
      document.title = base;
    };
  });

  let text = "";
  if (s) {
    if (s.kind === "none") text = "Dnes bez hodin.";
    else if (s.kind === "home") text = "Dnes máš jen samostudium, ve škole být nemusíš. Chceš-li, můžeš se s učitelem spojit.";
    else if (s.kind === "before") text = s.home ? `Teď je samostudium, můžeš být doma. Do školy až na ${fmtMin(s.first.begin)} (${s.first.subject}), končíš v ${fmtMin(s.last.end)}.` : `Začínáš v ${fmtMin(s.first.begin)} hodinou ${ms(s.first.subject)}, končíš v ${fmtMin(s.last.end)}.`;
    else if (s.kind === "in") text = s.slot.selfStudy ? `Právě je samostudium (${s.slot.subject}), ve škole být nemusíš. Končí ${inTime(s.left, s.secs)}.` : `Právě probíhá ${ms(s.slot.subject)}, zvonění ${inTime(s.left, s.secs)}. Končíš v ${fmtMin(s.last.end)}.`;
    else if (s.kind === "break") text = s.next.selfStudy ? `Přestávka. Další je samostudium (${s.next.subject}) ${inTime(s.minutes, s.secs)}, můžeš být doma.` : `Přestávka. Další je ${ms(s.next.subject)}${s.next.room ? ` v učebně ${s.next.room}` : ""} ${inTime(s.minutes, s.secs)}.`;
    else text = "Dnešek máš za sebou.";
  }
  return <div className="dayline" aria-live="polite">{text}<span className="mobile-only"> <BellFullButton slots={slots} inline /></span></div>;
}

/** Co je s hodinou právě teď (pro popisek na ose dne). */
function slotStatus(s: Slot, now: number | null) {
  if (s.cancelled) return { text: "Hodina odpadá", tone: "danger" };
  if (now == null) return { text: "", tone: "" };
  if (Math.round(now * 60) >= Math.round(s.end * 60)) return { text: "Už proběhla", tone: "" };
  if (now >= s.begin) { const sec = Math.round(s.end * 60) - Math.round(now * 60); return { text: `Právě probíhá · zbývá ${sec < 60 ? `${Math.max(1, sec)} s` : `${Math.ceil(sec / 60)} min`}`, tone: "live" }; }
  const sec = Math.round(s.begin * 60) - Math.round(now * 60);
  const left = Math.ceil(sec / 60);
  return { text: left > 90 ? `Začíná v ${fmtMin(s.begin)}` : sec < 60 ? `Začíná za ${Math.max(1, sec)} s` : `Začíná za ${left} min`, tone: "" };
}

/** Osa školního dne: bloky hodin podle skutečné délky, svislá čárka značí „teď“, najetím se zobrazí podrobnosti. */
export function DayRuler({ slots }: { slots: Slot[] }) {
  const now = useNow(5_000);
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  if (!slots.length) return null;
  const start = slots[0].begin;
  const end = slots[slots.length - 1].end;
  const pct = (m: number) => ((m - start) / (end - start)) * 100;
  const marker = now != null && now >= start && now <= end ? pct(now) : null;
  const shown = slots.find((s) => s.hour === hover);
  const st = shown ? slotStatus(shown, now) : null;
  const center = shown ? Math.min(82, Math.max(18, (pct(shown.begin) + pct(shown.end)) / 2)) : 0;
  return (
    <div className="ruler" onMouseLeave={() => setHover(null)}>
      <div className="ruler-track" role="group" aria-label="Osa dnešního dne">
        {slots.map((s) => (
          <button
            type="button"
            key={s.hour}
            className={`ruler-seg ${s.cancelled ? "cancelled" : now != null && now >= s.end ? "past" : now != null && now >= s.begin ? "live" : "future"}${s.change && !s.cancelled ? " changed" : ""}${s.selfStudy ? " selfstudy" : ""}${hover === s.hour ? " hot" : ""}`}
            style={{ left: `${pct(s.begin)}%`, width: `${pct(s.end) - pct(s.begin)}%`, ["--p" as string]: now != null && now >= s.begin && now < s.end ? `${((now - s.begin) / (s.end - s.begin)) * 100}%` : undefined }}
            aria-label={`${s.hour}. hodina, ${s.selfStudy ? "samostudium, " : ""}${s.subject}, ${fmtMin(s.begin)} až ${fmtMin(s.end)}${s.cancelled ? ", odpadá" : ""}. Otevřít v rozvrhu`}
            onMouseEnter={() => setHover(s.hour)}
            onFocus={() => setHover(s.hour)}
            onBlur={() => setHover(null)}
            onClick={() => {
              // myš: rovnou do rozvrhu; dotyk: první klepnutí ukáže podrobnosti, druhé otevře rozvrh
              const touch = !window.matchMedia("(hover: hover)").matches;
              if (s.open && (!touch || hover === s.hour)) (window.dispatchEvent(new Event("classmate:nav-start")), router.push(`/rozvrh?open=${s.open}`));
              else setHover(s.hour);
            }}
          />
        ))}
        {marker != null && <span className="ruler-now" style={{ left: `${marker}%` }} />}
        {shown && st && (
          <div className="ruler-pop" style={{ left: `${center}%` }} role="status">
            <div className="rp-head">
              <b>{shown.hour}. hodina</b>
              <span>{fmtMin(shown.begin)}–{fmtMin(shown.end)}</span>
            </div>
            <div className={`rp-subject${shown.cancelled ? " cancelled" : ""}`}>{shown.subject}</div>
            {shown.selfStudy && <div className="rp-meta selfstudy-note">{SELF_STUDY}: můžeš být doma</div>}
            {!shown.cancelled && (shown.room || shown.teacher) && <div className="rp-meta">{[shown.room && !shown.selfStudy && `Učebna ${shown.room}`, shown.teacher].filter(Boolean).join(" · ")}</div>}
            {shown.change && !shown.cancelled && <div className="rp-meta warn">{shown.change}</div>}
            {st.text && <div className={`rp-state ${st.tone}`}>{st.text}</div>}
            {shown.open && <div className="rp-open">Klikni pro otevření v rozvrhu →</div>}
          </div>
        )}
      </div>
      <div className="ruler-labels">
        <span>{fmtMin(start)}</span>
        <span>{fmtMin(end)}</span>
      </div>
    </div>
  );
}
