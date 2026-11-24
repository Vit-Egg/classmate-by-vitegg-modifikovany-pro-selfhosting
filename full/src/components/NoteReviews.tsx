"use client";

import { useEffect, useRef, useState } from "react";
import { saveNoteVoteAction } from "@/app/actions/notes";
import type { NoteVotes } from "@/lib/note-votes";

const when = (t: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric" }).format(t);

function Stars({ value, onPick, size = 22, label }: { value: number; onPick?: (n: number) => void; size?: number; label: string }) {
  return (
    <span className="stars" role={onPick ? "radiogroup" : "img"} aria-label={`${label}: ${value} z 5`} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} z 5`} className={n <= value ? "on" : ""} onClick={() => onPick(n)}>★</button>
        ) : (
          <i key={n} className={n <= Math.round(value) ? "on" : ""} aria-hidden>★</i>
        ),
      )}
    </span>
  );
}

/**
 * Veřejné hodnocení poznámky: průměr, moje hvězdičky s komentářem a hodnocení ostatních.
 * Hodnotit smí každý kromě autora; autor vidí jen hodnocení od ostatních (canVote = false).
 */
export function NoteReviews({ noteId, initial, canVote }: { noteId: number; initial: NoteVotes; canVote: boolean }) {
  const [stars, setStars] = useState(initial.mine?.stars ?? 0);
  const [comment, setComment] = useState(initial.mine?.comment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [mineSaved, setMineSaved] = useState(initial.mine);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ stars, comment });
  latest.current = { stars, comment };

  const send = async () => {
    setState("saving");
    const { stars: s, comment: c } = latest.current;
    try {
      const r = await saveNoteVoteAction(noteId, s || null, c);
      setState(r.ok ? "saved" : "error");
      if (r.ok) setMineSaved(s ? { stars: s, comment: c } : null);
    } catch {
      setState("error");
    }
  };
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(), 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void send(); } }, []);

  // moje hodnocení se do součtu počítá hned, bez čekání na obnovení stránky
  const others = initial.others;
  const sum = others.reduce((a, o) => a + o.stars, 0) + (mineSaved?.stars ?? 0);
  const count = others.length + (mineSaved ? 1 : 0);
  const avg = count ? sum / count : 0;

  return (
    <section className="reviews" aria-label="Hodnocení poznámky">
      <div className="reviews-head">
        <b>Hodnocení poznámky</b>
        {count > 0 ? (
          <span className="reviews-avg"><Stars value={avg} size={16} label="Průměrné hodnocení" /> <b>{avg.toFixed(1).replace(".", ",")}</b> <span className="muted">({count} hodnocení)</span></span>
        ) : (
          <span className="muted">{canVote ? "Zatím nikdo neohodnotil. Buď první." : "Zatím ji nikdo neohodnotil."}</span>
        )}
      </div>

      {canVote && (
        <div className="reviews-mine">
          <div className="reviews-row">
            <span className="rate-name">Moje hodnocení (vidí ho i ostatní)</span>
            <Stars value={stars} label="Moje hodnocení" onPick={(n) => { setStars(stars === n ? 0 : n); latest.current = { stars: stars === n ? 0 : n, comment }; void send(); }} />
            <span className="save-state" aria-live="polite">{state === "saving" ? "Ukládám…" : state === "saved" ? "Uloženo" : state === "error" ? "Nepovedlo se uložit" : ""}</span>
          </div>
          {stars > 0 && (
            <textarea
              className="reviews-comment"
              rows={2}
              maxLength={300}
              placeholder="Krátký komentář (nepovinný): co ti pomohlo, co chybí…"
              value={comment}
              onChange={(e) => { setComment(e.target.value); latest.current = { stars, comment: e.target.value }; later(); }}
              onBlur={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; void send(); } }}
            />
          )}
        </div>
      )}

      {others.length > 0 && (
        <ul className="reviews-list">
          {others.map((o) => (
            <li key={o.user_id}>
              <div className="reviews-who"><b>{o.name}</b> <Stars value={o.stars} size={14} label={`Hodnocení od ${o.name}`} /> <span className="muted">{when(o.updated_at)}</span></div>
              {o.comment && <p>{o.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
