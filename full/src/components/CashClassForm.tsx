"use client";

import { useState } from "react";
import { clearStripe, saveMethods, saveStripe, setCash } from "@/app/actions/pokladna";
import { ActionForm, ConfirmButton, Submit } from "./forms";
import { CopyField } from "./CopyField";
import { SwitchRow } from "./SwitchRow";

type P = { classId: number; enabled: boolean; personalOn: boolean; qrOn: boolean; cardOn: boolean; stripeOn: boolean; last4: string; webhookUrl: string; qrAccount: string; qrName: string };

/** Pokladna u třídy (jen správce): zapnutí modulu, způsoby platby (aspoň jeden) a klíče Stripe pro kartu. */
export function CashClassForm({ classId, enabled, personalOn, qrOn, cardOn, stripeOn, last4, webhookUrl, qrAccount, qrName }: P) {
  const [on, setOn] = useState(enabled);
  const [personal, setPersonal] = useState(personalOn);
  const [qr, setQr] = useState(qrOn);
  const [card, setCardOn] = useState(cardOn);
  return (
    <div className="stack">
      <ActionForm action={setCash} resetOnSuccess={false}>
        <input type="hidden" name="class" value={classId} />
        <SwitchRow name="enabled" label="Pokladna u třídy" hint="Pokladník nebo správce zadává platby, členové je platí" checked={on} onChange={setOn} />
        <div><Submit>Uložit</Submit></div>
      </ActionForm>
      {enabled && (
        <>
          <hr className="cash-hr" />
          <h4 className="cash-h">Způsoby platby</h4>
          <ActionForm action={saveMethods} resetOnSuccess={false}>
            <input type="hidden" name="class" value={classId} />
            <SwitchRow name="personal" label="Osobně pokladníkovi" hint="Člen zaplatí hotově a pokladník to označí (nebo to člen nahlásí a pokladník potvrdí)" checked={personal} onChange={setPersonal} />
            <SwitchRow name="qr" label="QR kód na účet třídy" hint="Člen naskenuje QR kód s částkou v bankovní aplikaci a nahlásí zaplacení, pokladník potvrdí po připsání" checked={qr} onChange={setQr} />
            {qr && (
              <>
                <label className="field"><span>Číslo účtu třídy</span><input className="input" name="account" defaultValue={qrAccount} placeholder="19-2000145399/0800 nebo IBAN" autoComplete="off" spellCheck={false} /></label>
                <label className="field"><span>Jméno příjemce (nepovinné)</span><input className="input" name="holder" defaultValue={qrName} maxLength={80} placeholder="Např. Třída 1.B" autoComplete="off" /></label>
              </>
            )}
            <SwitchRow name="card" label="Karta přes Stripe" hint={stripeOn ? `Klíč končí na ${last4}. Vypnutí klíče nesmaže.` : "Nejdřív ulož klíče Stripe níže"} checked={card} onChange={setCardOn} disabled={!stripeOn} />
            <p className="hint" style={{ margin: 0 }}>Aspoň jeden způsob musí zůstat zapnutý. Částka i variabilní symbol (číslo platby) se do QR kódu doplní samy.</p>
            <div><Submit>Uložit způsoby platby</Submit></div>
          </ActionForm>

          <hr className="cash-hr" />
          <h4 className="cash-h">Klíče Stripe (platba kartou)</h4>
          {stripeOn ? (
            <>
              <p className="hint" style={{ margin: 0 }}>Klíče jsou uložené (končí na <b>{last4}</b>), platby jdou přímo na účet Stripe téhle třídy.</p>
              <form action={clearStripe}><input type="hidden" name="class" value={classId} /><ConfirmButton className="btn small danger" message="Smazat klíče Stripe u třídy? Karta se vypne.">Smazat klíče</ConfirmButton></form>
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Nepovinné. Peníze z karet půjdou na účet Stripe, jehož klíče sem vložíš (třeba účet pokladníka nebo spolku).</p>
          )}
          <ActionForm action={saveStripe}>
            <input type="hidden" name="class" value={classId} />
            <label className="field"><span>Klíč Stripe</span><input className="input" type="password" name="key" autoComplete="off" spellCheck={false} placeholder="rk_live_… (omezený klíč, jen Checkout Sessions)" required /></label>
            <label className="field"><span>Podpisový klíč webhooku</span><input className="input" type="password" name="webhook" autoComplete="off" spellCheck={false} placeholder="whsec_…" required /></label>
            <p className="hint" style={{ margin: 0 }}>Ve Stripe vytvoř webhook na tuhle adresu a vyber události <b>checkout.session.completed</b> a <b>checkout.session.async_payment_succeeded</b>:</p>
            <CopyField value={webhookUrl} />
            <p className="hint" style={{ margin: 0 }}>Klíče se uloží šifrovaně a znovu se nezobrazí. Doporučený je omezený klíč (Restricted key) s právy jen pro Checkout Sessions (zápis a čtení). Po uložení karty zapni nahoře v Způsobech platby.</p>
            <div><Submit>{stripeOn ? "Přepsat klíče" : "Uložit klíče"}</Submit></div>
          </ActionForm>
        </>
      )}
    </div>
  );
}
