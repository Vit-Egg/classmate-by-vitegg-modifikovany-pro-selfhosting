"use client";

import { useState } from "react";
import { setupAction } from "@/app/actions/setup";
import { ActionForm, Submit } from "@/components/forms";

export function SetupForm({ fromEnv }: { fromEnv: boolean }) {
  // hodnoty se drží ve stavu, ať se při chybě (špatná adresa, krátké heslo) nevymaže celý formulář
  const [f, setF] = useState({ token: "", name: "", email: "", password: "", school: "", bakalari: "", class: "" });
  const bind = (k: keyof typeof f) => ({ name: k, value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value })) });
  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Vítej v Classmate</h1>
      <p className="subtitle" style={{ margin: "0 0 20px", fontSize: 15 }}>
        Tenhle server je nový. Vytvoř účet správce a první školu, ostatní třídy a studenti se přidají sami při registraci.
      </p>
      <ActionForm action={setupAction} resetOnSuccess={false}>
        <label className="field">
          <span>Instalační kód</span>
          <input className="input" {...bind("token")} autoComplete="off" required />
          <p className="hint">{fromEnv ? "Je v souboru .env na serveru jako SETUP_TOKEN." : "Server ho při startu vypsal do svého logu: docker compose logs | grep -A1 „Instalační kód“."}</p>
        </label>
        <fieldset className="fieldset">
          <legend>Správce</legend>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Jméno a příjmení</span>
              <input className="input" {...bind("name")} autoComplete="name" required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input className="input" type="email" {...bind("email")} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Heslo</span>
              <input className="input" type="password" {...bind("password")} autoComplete="new-password" minLength={8} required />
            </label>
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Škola</legend>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Název školy</span>
              <input className="input" {...bind("school")} placeholder="Gymnázium Příklad" required />
            </label>
            <label className="field">
              <span>Adresa Bakalářů</span>
              <input className="input" {...bind("bakalari")} placeholder="https://bakalari.priklad.cz" inputMode="url" />
              <p className="hint">Bez ní se nikdo nezaregistruje. Jde doplnit později ve Správě.</p>
            </label>
            <label className="field">
              <span>Tvoje třída</span>
              <input className="input" {...bind("class")} placeholder="3.A, nebo Správci" required />
              <p className="hint">Účet musí patřit nějaké třídě. Ostatní třídy se vytvoří samy podle Bakalářů.</p>
            </label>
          </div>
        </fieldset>
        <div style={{ height: 8 }} />
        <Submit className="btn primary big">Vytvořit server</Submit>
      </ActionForm>
    </>
  );
}
