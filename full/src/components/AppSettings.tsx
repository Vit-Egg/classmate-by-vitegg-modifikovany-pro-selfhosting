"use client";

import { useCallback, useEffect, useState } from "react";
import { getNative, nativeInfo, type NativeInfo } from "@/lib/native";

/** Stav nativní části; obnovuje se při návratu z nastavení systému (stránka se znovu zobrazí). */
function useInfo() {
  const [info, setInfo] = useState<NativeInfo | null>(null);
  const refresh = useCallback(() => setInfo(nativeInfo()), []);
  useEffect(() => {
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("classmate:native", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("classmate:native", refresh);
    };
  }, [refresh]);
  return [info, refresh] as const;
}

/** Nastavení oznámení, která umí jen aplikace: systémová oznámení a trvalá notifikace s průběhem dne. */
export function AppNotifySettings() {
  const [info, refresh] = useInfo();
  const native = getNative();
  if (!info || !native) return null;
  return (
    <div className="card rows">
      <div className="set-row">
        <div>
          <b>Oznámení v telefonu</b>
          <small>{info.notifications ? "Zprávy z Classmate ti přijdou i při zavřené aplikaci. Jednotlivé druhy upravíš v nastavení oznámení systému." : "Jsou vypnutá, takže ti nic nepřijde."}</small>
        </div>
        <button type="button" className="btn small" onClick={() => (info.notifications ? native.openSettings("notifications") : native.requestNotifications())}>
          {info.notifications ? "Upravit" : "Povolit"}
        </button>
      </div>
      <div className="set-row">
        <div>
          <b>Průběh dne v notifikaci</b>
          <small>Trvalá notifikace s tím, co právě probíhá, a odpočtem do konce hodiny nebo přestávky.</small>
        </div>
        <button
          type="button"
          className={`switch${info.live ? " on" : ""}`}
          role="switch"
          aria-checked={info.live}
          aria-label="Průběh dne v notifikaci"
          onClick={() => {
            native.setLive(!info.live);
            setTimeout(refresh, 300);
          }}
        >
          <i />
        </button>
      </div>
      {typeof native.setDnd === "function" && (
        <>
          <div className="set-row">
            <div>
              <b>Nerušit během hodin</b>
              <small>Při začátku hodiny se v telefonu samo zapne Nerušit (jen prioritní, budíky fungují) a po zvonění se vypne. Samostudium a zrušené hodiny se nepočítají. Když máš Nerušit zapnuté sám, aplikace ho nevypíná.</small>
            </div>
            <button
              type="button"
              className={`switch${info.dnd ? " on" : ""}`}
              role="switch"
              aria-checked={!!info.dnd}
              aria-label="Nerušit během hodin"
              onClick={() => {
                native.setDnd?.(!info.dnd);
                setTimeout(refresh, 300);
              }}
            >
              <i />
            </button>
          </div>
          {info.dnd && !info.dndAccess && (
            <div className="set-row">
              <div>
                <b>Přístup k režimu Nerušit</b>
                <small>Systém musí aplikaci dovolit měnit Nerušit. V seznamu zvol Classmate a povol.</small>
              </div>
              <button type="button" className="btn small" onClick={() => native.openSettings("dnd")}>Povolit</button>
            </div>
          )}
        </>
      )}
      {info.live && !info.exactAlarms && (
        <div className="set-row">
          <div>
            <b>Přesné časování</b>
            <small>Bez povolení se může notifikace při změně hodiny zpozdit o pár minut.</small>
          </div>
          <button type="button" className="btn small" onClick={() => native.openSettings("exact")}>Povolit</button>
        </div>
      )}
    </div>
  );
}

/** Karta „Aplikace“ v nastavení: verze nainstalované aplikace a server, ke kterému je připojená (s možností změny). */
export function AppInfoCard() {
  const [info] = useInfo();
  const native = getNative();
  if (!info) return null;
  const host = info.server?.replace(/^https?:\/\//, "");
  return (
    <div className="card rows">
      <div className="set-row">
        <div>
          <b>Classmate pro {info.platform === "ios" ? "iPhone" : "Android"}</b>
          <small>Verze {info.version}. Vzhled a funkce se aktualizují samy se serverem, aplikaci stačí aktualizovat jen občas kvůli oznámením a widgetům.</small>
        </div>
      </div>
      {host && (
        <div className="set-row">
          <div>
            <b>Server</b>
            <small>{host}</small>
          </div>
          {info.canChangeServer && typeof native?.changeServer === "function" && (
            <button type="button" className="btn small" onClick={() => native.changeServer?.()}>Změnit server</button>
          )}
        </div>
      )}
    </div>
  );
}

const WIDGETS: { id: string; name: string; hint: string }[] = [
  { id: "now", name: "Teď", hint: "Co právě probíhá a velký odpočet do zvonění nebo do konce přestávky." },
  { id: "timetable", name: "Rozvrh dnes", hint: "Dnešní hodiny s učebnou a suplováním, probíhající hodina je zvýrazněná. Po škole ukáže zítřek." },
  { id: "tasks", name: "Úkoly", hint: "Nejbližší otevřené úkoly podle termínu a barvy předmětu." },
  { id: "tests", name: "Testy a zkoušení", hint: "Nejbližší testy a zkoušení s odpočtem dnů." },
  { id: "marks", name: "Známky", hint: "Poslední známky. Jsou vidět všem, kdo se na plochu podívají." },
  { id: "lunch", name: "Oběd", hint: "Dnešní oběd ze Strava.cz, po 14. hodině následující den." },
  { id: "shortcuts", name: "Zkratky", hint: "Rychlé otevření rozvrhu, úkolů, testů a zkoušení, známek a poznámek." },
];

/** Widgety na plochu: tlačítko „Přidat“ nabídne přidání přímo (launcher se zeptá). Seznam je ve webu, takže ho jde doplnit bez nové verze aplikace. */
export function AppWidgets() {
  const [info] = useInfo();
  const [note, setNote] = useState("");
  const native = getNative();
  if (!info || !native || typeof native.pinWidget !== "function" || !info.widgets) return null;
  const known = new Set(info.widgets);
  const add = (id: string) => {
    const ok = native.pinWidget?.(id);
    setNote(ok ? "Potvrď přidání v nabídce na ploše." : "Tvůj launcher přidání přes aplikaci nepodporuje. Přidej widget dlouhým podržením plochy → Widgety → Classmate.");
  };
  return (
    <div>
      <div className="card rows">
        {WIDGETS.filter((w) => known.has(w.id)).map((w) => (
          <div key={w.id} className="set-row">
            <div>
              <b>{w.name}</b>
              <small>{w.hint}</small>
            </div>
            <button type="button" className="btn small" onClick={() => add(w.id)}>Přidat</button>
          </div>
        ))}
      </div>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}
