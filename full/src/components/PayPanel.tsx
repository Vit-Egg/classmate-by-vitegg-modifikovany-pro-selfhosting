"use client";

import { useState } from "react";
import { claimPayment, withdrawPayment } from "@/app/actions/pokladna";
import { Icon } from "./Icon";
import { PayButton } from "./PayButton";

type Qr = { image: string; account: string; holder: string; amount: string; vs: string; message: string };
type Props = {
  payment: number;
  amount: string;
  methods: { personal: boolean; qr: boolean; card: boolean };
  cardAllowed: boolean; // karta je zapnutá a částka je dost vysoká
  /** celková částka na kartě včetně poplatku Stripe a samotný poplatek (prázdné, když se poplatek nepřičítá) */
  cardTotal?: string;
  cardFee?: string;
  qr: Qr | null;
  claimed: "qr" | "cash" | null;
};

/** Způsoby zaplacení jedné platby: karta, QR kód (se stažením), osobně. Člen může nahlásit „zaplatil jsem“, pokladník to potvrdí. */
export function PayPanel({ payment, amount, methods, cardAllowed, cardTotal, cardFee, qr, claimed }: Props) {
  const [open, setOpen] = useState<"qr" | "cash" | null>(null);

  if (claimed) {
    return (
      <div className="cash-wait" role="status">
        <span className="cash-wait-ic"><Icon name="refresh" size={16} /></span>
        <div>
          <b>Čeká se na potvrzení pokladníkem</b>
          <small>Hlásil/a jsi {claimed === "qr" ? "platbu převodem na účet" : "platbu osobně"}. Až ji pokladník potvrdí, uvidíš ji jako zaplacenou.</small>
        </div>
        <form action={withdrawPayment}><input type="hidden" name="payment" value={payment} /><button className="btn small">Vzít zpět</button></form>
      </div>
    );
  }

  return (
    <div className="cash-ways">
      <div className="cash-buttons">
        {methods.card && cardAllowed && <PayButton payment={payment} label={cardFee ? `Zaplatit kartou · ${cardTotal}` : "Zaplatit kartou"} />}
        {methods.qr && qr && <button type="button" className={`btn${open === "qr" ? " primary" : ""}`} aria-expanded={open === "qr"} onClick={() => setOpen(open === "qr" ? null : "qr")}>Zaplatit QR kódem</button>}
        {methods.personal && <button type="button" className={`btn${open === "cash" ? " primary" : ""}`} aria-expanded={open === "cash"} onClick={() => setOpen(open === "cash" ? null : "cash")}>Zaplatím osobně</button>}
      </div>

      {methods.card && cardAllowed && cardFee && <p className="hint cash-fee">Kartou zaplatíš {cardTotal}: cena {amount} a poplatek za platbu kartou {cardFee}. QR kódem a osobně platíš jen {amount}.</p>}

      {open === "qr" && qr && (
        <div className="cash-panel">
          <div className="cash-qr-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt={`QR kód pro platbu ${qr.amount}`} width={180} height={180} />
            <a className="btn small" href={qr.image} download={`qr-platba-${qr.vs}.png`}>Stáhnout QR kód</a>
          </div>
          <div className="cash-panel-main">
            <dl>
              <div><dt>Účet</dt><dd>{qr.account}</dd></div>
              {qr.holder && <div><dt>Příjemce</dt><dd>{qr.holder}</dd></div>}
              <div><dt>Částka</dt><dd>{qr.amount}</dd></div>
              <div><dt>Variabilní symbol</dt><dd>{qr.vs}</dd></div>
              <div><dt>Zpráva</dt><dd>{qr.message}</dd></div>
            </dl>
            <p className="hint" style={{ margin: 0 }}>Naskenuj kód v bankovní aplikaci, nebo si ho stáhni a otevři v ní z galerie. Po odeslání platby klikni na Zaplaceno, pokladník ji potvrdí, až dorazí na účet.</p>
            <form action={claimPayment}><input type="hidden" name="payment" value={payment} /><input type="hidden" name="how" value="qr" /><button className="btn primary">Zaplaceno</button></form>
          </div>
        </div>
      )}

      {open === "cash" && (
        <div className="cash-panel cash-panel-simple">
          <p style={{ margin: 0 }}>Předej {amount} pokladníkovi. Až to uděláš, klikni na Zaplaceno a pokladník to potvrdí.</p>
          <form action={claimPayment}><input type="hidden" name="payment" value={payment} /><input type="hidden" name="how" value="cash" /><button className="btn primary">Zaplaceno</button></form>
        </div>
      )}
    </div>
  );
}
