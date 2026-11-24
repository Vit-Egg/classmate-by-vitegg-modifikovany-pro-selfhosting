"use client";

import { useActionState } from "react";
import { resendEmailConfirmation, saveEmailNotify } from "@/app/actions/settings";
import { initial } from "@/lib/action";
import { ActionForm, Submit } from "./forms";

const OPTIONS = [
  { value: "off", label: "Nechci e-maily", hint: "Upozornění uvidíš jen ve zvonečku a v telefonu." },
  { value: "instant", label: "Hned, jak se něco stane", hint: "Přijde ti e-mail s novinkami do pár minut. V noci (22–6 h) se počká do rána." },
  { value: "digest", label: "Jednou denně v 7:00", hint: "Jeden e-mail ráno se vším, co přibylo od včerejška." },
] as const;

/** Nastavení e-mailových upozornění. Posílají se jen na potvrzenou adresu. */
export function EmailNotifySetting({ mode, confirmed, email, configured, isAdmin }: { mode: "off" | "instant" | "digest"; confirmed: boolean; email: string; configured: boolean; isAdmin: boolean }) {
  const [resend, resendAction, pending] = useActionState(resendEmailConfirmation, initial);
  if (!configured)
    return (
      <div className="card card-pad">
        <p style={{ margin: 0 }}>E-mailová upozornění zatím nejsou na serveru zapnutá.</p>
        {isAdmin && <p className="hint" style={{ margin: "8px 0 0" }}>Jako správce je zapneš nastavením <code>SMTP_HOST</code>, <code>SMTP_FROM</code> (a obvykle <code>SMTP_USER</code>, <code>SMTP_PASS</code>) v souboru .env, viz DEPLOY.md.</p>}
      </div>
    );
  const waiting = mode !== "off" && !confirmed;
  return (
    <div className="card card-pad" style={{ display: "grid", gap: 14 }}>
      <ActionForm action={saveEmailNotify} resetOnSuccess={false}>
        <fieldset className="radio-list" style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend className="hint" style={{ padding: 0, marginBottom: 6 }}>Posíláme na {email}</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className="radio-row">
              <input type="radio" name="mode" value={o.value} defaultChecked={mode === o.value} />
              <span><b>{o.label}</b><small>{o.hint}</small></span>
            </label>
          ))}
        </fieldset>
        <div><Submit>Uložit</Submit></div>
      </ActionForm>
      {mode !== "off" && confirmed && <p className="hint" style={{ margin: 0 }}>Adresa je potvrzená. V každém e-mailu je odkaz na odhlášení.</p>}
      {waiting && (
        <div className="notice-warn">
          <p style={{ margin: 0 }}>Čekáme na potvrzení adresy. Klikni na odkaz v e-mailu, který jsme ti poslali. Dokud to neuděláš, nic se posílat nebude.</p>
          <form action={resendAction} style={{ marginTop: 10 }}>
            <button className="btn small" disabled={pending}>{pending ? "Posílám…" : "Poslat potvrzení znovu"}</button>
            {resend.message && <span className="hint" style={{ marginLeft: 10 }}>{resend.message}</span>}
            {resend.error && <span className="msg-error" style={{ marginLeft: 10 }}>{resend.error}</span>}
          </form>
        </div>
      )}
    </div>
  );
}
