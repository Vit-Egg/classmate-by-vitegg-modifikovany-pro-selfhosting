"use client";

import { useEffect, useRef } from "react";
import { setMarksSharing } from "@/app/actions/settings";
import { MIN_PEOPLE } from "@/lib/stats-const";

/** Jednorázová otázka na sdílení známek do anonymních statistik. Nejde zavřít jinak než odpovědí. */
export function MarksConsent() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => e.preventDefault()} aria-labelledby="mc-title">
      <div className="modal-card consent-card">
        <h2 id="mc-title">Chceš vidět průměry ostatních?</h2>
        <p className="consent-lead">
          Když povolíš anonymní sdílení svých známek, uvidíš u každé písemky <b>průměr všech, kdo to taky povolili</b>. Hned poznáš, jak test dopadl.
        </p>
        <ul className="consent-list">
          <li>Sdílí se jen číselná známka a označení písemky (předmět, název, datum). <b>Bez jména, e-mailu i třídy.</b></li>
          <li>Průměr se ukáže až od {MIN_PEOPLE} lidí, takže se z něj nedá poznat nikdo konkrétní.</li>
          <li>Svůj souhlas můžeš kdykoliv změnit v Nastavení. Když ho odvoláš, všechny tvé příspěvky se smažou.</li>
        </ul>
        <form action={setMarksSharing} className="consent-buttons">
          <button name="allow" value="1" className="btn big allow-btn">Povolit</button>
          <button name="allow" value="0" className="btn big">Nepovolit</button>
        </form>
      </div>
    </dialog>
  );
}
