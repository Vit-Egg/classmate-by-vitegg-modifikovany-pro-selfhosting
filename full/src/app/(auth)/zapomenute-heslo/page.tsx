import Link from "next/link";
import { requestResetAction } from "@/app/actions/password";
import { ActionForm, Submit } from "@/components/forms";

export const metadata = { title: "Zapomenuté heslo" };

export default function ForgotPassword() {
  return (
    <>
      <h1>Zapomenuté heslo</h1>
      <p className="hint" style={{ marginBottom: 18 }}>Napiš e-mail, se kterým ses registroval(a). Pošleme ti odkaz, kterým si nastavíš nové heslo.</p>
      <ActionForm action={requestResetAction} resetOnSuccess={false}>
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
        </label>
        <div style={{ height: 8 }} />
        <Submit className="btn primary big">Poslat odkaz</Submit>
      </ActionForm>
      <p className="alt"><Link href="/prihlaseni">Zpět na přihlášení</Link></p>
    </>
  );
}
