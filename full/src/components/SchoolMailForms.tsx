"use client";

import { useState } from "react";
import { updateSchoolMail, updateSchoolMicrosoft } from "@/app/actions/admin";
import { ActionForm, Submit } from "./forms";
import { CopyField } from "./CopyField";
import { SwitchRow } from "./SwitchRow";

type MailDefaults = { kind: string; domain: string; imapHost: string; imapPort: string; smtpHost: string; smtpPort: string };

/** Nastavení pošty u školy. Pole pro vlastní e-mail se ukážou jen při volbě „Vlastní e-mail“; Microsoft 365 se jen vybere a jde zvolit, jen když je u školy zapnutý. */
export function SchoolMailForm({ id, msEnabled, d }: { id: number; msEnabled: boolean; d: MailDefaults }) {
  const [kind, setKind] = useState(d.kind === "microsoft" && !msEnabled ? "" : d.kind);
  return (
    <ActionForm action={updateSchoolMail} resetOnSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <label className="field">
        <span>Školní e-mail</span>
        <select className="select" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Nepoužívat</option>
          <option value="microsoft" disabled={!msEnabled}>Microsoft 365{msEnabled ? "" : " (nejdřív ho zapni v nastavení Microsoft 365)"}</option>
          <option value="imap">Vlastní e-mail (IMAP/SMTP)</option>
        </select>
      </label>
      {kind === "microsoft" && <p className="hint" style={{ margin: 0 }}>Školní e-mail půjde přes Microsoft 365, nic dalšího se nenastavuje.</p>}
      {kind === "imap" && (
        <>
          <label className="field"><span>Koncovka adres</span><input className="input" name="domain" placeholder="priklad.cz" defaultValue={d.domain} required /></label>
          <label className="field"><span>Server IMAP</span><input className="input" name="imapHost" placeholder="imap.priklad.cz" defaultValue={d.imapHost} required /></label>
          <label className="field"><span>Port IMAP</span><input className="input" name="imapPort" inputMode="numeric" placeholder="993" defaultValue={d.imapPort} /></label>
          <label className="field"><span>Server SMTP</span><input className="input" name="smtpHost" placeholder="smtp.priklad.cz" defaultValue={d.smtpHost} required /></label>
          <label className="field"><span>Port SMTP</span><input className="input" name="smtpPort" inputMode="numeric" placeholder="587" defaultValue={d.smtpPort} /></label>
        </>
      )}
      <Submit>Uložit</Submit>
    </ActionForm>
  );
}

const DOMAIN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;

/** Zapnutí a vypnutí Microsoft 365 u školy, koncovka adres a odkaz pro správce školy (ukáže se hned při zapnutí a podle právě napsané koncovky). */
export function SchoolMicrosoftForm({ id, enabled: initial, domain: initialDomain, clientId, redirectUri }: { id: number; enabled: boolean; domain: string; clientId: string; redirectUri: string }) {
  const [on, setOn] = useState(initial);
  const [domain, setDomain] = useState(initialDomain);
  const clean = domain.trim().replace(/^@/, "").toLowerCase();
  const link = on && clientId && redirectUri && DOMAIN.test(clean) ? `https://login.microsoftonline.com/${clean}/adminconsent?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}` : "";
  return (
    <>
      <ActionForm action={updateSchoolMicrosoft} resetOnSuccess={false}>
        <input type="hidden" name="id" value={id} />
        <SwitchRow label="Microsoft 365 u školy" hint="Teams a případně školní e-mail se propojují školním účtem" checked={on} onChange={setOn} name="enabled" value="1" />
        {on ? (
          <label className="field"><span>Koncovka adres školy</span><input className="input" name="domain" placeholder="ssps.cz" value={domain} onChange={(e) => setDomain(e.target.value)} required /></label>
        ) : (
          <input type="hidden" name="domain" value={domain} />
        )}
        <Submit>Uložit</Submit>
      </ActionForm>
      {link && (
        <div className="field" style={{ marginTop: 14 }}>
          <span>Odkaz pro správce školy (souhlas s aplikací)</span>
          <CopyField value={link} />
          <p className="hint" style={{ margin: "6px 0 0" }}>Správce školního Microsoft 365 ho otevře, přihlásí se a klikne na Přijmout. Schválí tím čtení a odesílání pošty, kalendář (schůzky Teams), zadání, chaty, týmy, kanály a soubory v Teams. Vždy jen to, co vidí sám přihlášený uživatel.</p>
        </div>
      )}
    </>
  );
}
