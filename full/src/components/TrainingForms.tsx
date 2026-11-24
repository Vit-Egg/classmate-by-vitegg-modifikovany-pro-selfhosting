"use client";

import { useState } from "react";
import { connectIntervalsAction, disconnectIntervalsAction, importIntervalsAction, saveProfileAction, setSchoolTrainingAction } from "@/app/actions/denik";
import { ActionForm, ConfirmButton, Submit } from "./forms";
import { SwitchRow } from "./SwitchRow";

type P = { sport: string; club: string; category: string; frequency: string; teacher: string; submit1: string; submit2: string };

/** Údaje z hlavičky tabulky (list ZAČÍT ZDE). Jméno a třída se berou z profilu. */
export function ProfileForm({ p, year }: { p: P; year: string }) {
  return (
    <ActionForm action={saveProfileAction} resetOnSuccess={false}>
      <div className="tr-two">
        <label className="field"><span>Sport / disciplína</span><input className="input" name="sport" maxLength={120} defaultValue={p.sport} autoComplete="off" /></label>
        <label className="field"><span>Klub / oddíl</span><input className="input" name="club" maxLength={120} defaultValue={p.club} autoComplete="off" /></label>
      </div>
      <div className="tr-two">
        <label className="field"><span>Kategorie</span><input className="input" name="category" maxLength={80} defaultValue={p.category} autoComplete="off" /></label>
        <label className="field"><span>Obvyklá frekvence tréninků</span><input className="input" name="frequency" maxLength={120} defaultValue={p.frequency} placeholder="např. 4× týdně" autoComplete="off" /></label>
      </div>
      <label className="field"><span>Vyučující TEV</span><input className="input" name="teacher" maxLength={120} defaultValue={p.teacher} autoComplete="off" /></label>
      <div className="tr-two">
        <label className="field"><span>Datum odevzdání – 1. pololetí</span><input className="input" type="date" name="submit1" defaultValue={p.submit1} /></label>
        <label className="field"><span>Datum odevzdání – 2. pololetí</span><input className="input" type="date" name="submit2" defaultValue={p.submit2} /></label>
      </div>
      <p className="hint" style={{ margin: 0 }}>Jméno, třída a školní rok ({year}) se do tabulky doplní samy.</p>
      <div><Submit>Uložit údaje</Submit></div>
    </ActionForm>
  );
}

/** Propojení s Intervals.icu a načtení aktivit za období. */
export function IntervalsPanel({ connected, athlete, lastSync, from, to }: { connected: boolean; athlete: string; lastSync: string; from: string; to: string }) {
  if (!connected) {
    return (
      <ActionForm action={connectIntervalsAction}>
        <p className="hint" style={{ margin: 0 }}>
          V Intervals.icu otevři Nastavení → Developer Settings a vygeneruj si osobní API klíč. Klíč se u nás ukládá šifrovaně a slouží jen ke čtení tvých aktivit.
        </p>
        <label className="field"><span>API klíč</span><input className="input" name="key" type="password" autoComplete="off" required /></label>
        <label className="field"><span>ID sportovce (nepovinné)</span><input className="input" name="athlete" placeholder="i12345, nebo nech prázdné" autoComplete="off" /></label>
        <div><Submit pendingText="Ověřuju…">Propojit Intervals.icu</Submit></div>
      </ActionForm>
    );
  }
  return (
    <div className="stack">
      <div className="kv" style={{ padding: 0 }}>
        <div><small>Propojeno</small><strong>Intervals.icu{athlete !== "0" ? ` · ${athlete}` : ""}</strong></div>
        <form action={disconnectIntervalsAction}><ConfirmButton message="Odpojit Intervals.icu? Už načtené zápisy v deníku zůstanou.">Odpojit</ConfirmButton></form>
      </div>
      <ActionForm action={importIntervalsAction} resetOnSuccess={false}>
        <div className="tr-two">
          <label className="field"><span>Načíst od</span><input className="input" type="date" name="from" defaultValue={from} required /></label>
          <label className="field"><span>do</span><input className="input" type="date" name="to" defaultValue={to} required /></label>
        </div>
        <p className="hint" style={{ margin: 0 }}>Přidají se jen aktivity, které v deníku ještě nejsou, a už načtené a upravené se nepřepisují. Cíl a osobní zhodnocení si ke každému doplníš sám. Aktivity ze Stravy Intervals.icu nepředává.{lastSync && ` Naposledy načteno ${lastSync}.`}</p>
        <div><Submit pendingText="Načítám…">Načíst aktivity</Submit></div>
      </ActionForm>
    </div>
  );
}

/** Povolení modulu u školy (jen správce). */
export function SchoolTrainingForm({ schoolId, enabled }: { schoolId: number; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <ActionForm action={setSchoolTrainingAction} resetOnSuccess={false}>
      <input type="hidden" name="school" value={schoolId} />
      <SwitchRow name="enabled" label="Tréninkový deník" hint="Studenti ve škole si ho můžou zapnout v Nastavení: deník aktivit a týdenních reflexí pro program Aktivní sportovec s tabulkou ke stažení" checked={on} onChange={setOn} />
      <div><Submit>Uložit</Submit></div>
    </ActionForm>
  );
}
