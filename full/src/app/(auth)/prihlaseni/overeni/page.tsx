import Link from "next/link";
import { verifyLoginAction } from "@/app/actions/auth";
import { ActionForm, Submit } from "@/components/forms";

export const metadata = { title: "Ověření" };

export default function VerifyPage() {
  return (
    <>
      <h1>Dvoufázové ověření</h1>
      <p className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        Zadej šestimístný kód z aplikace pro ověřování, nebo jeden ze záložních kódů.
      </p>
      <ActionForm action={verifyLoginAction} resetOnSuccess={false}>
        <label className="field">
          <span>Kód</span>
          <input className="input" name="code" inputMode="text" autoComplete="one-time-code" required autoFocus />
        </label>
        <Submit className="btn primary big">Ověřit</Submit>
      </ActionForm>
      <p className="alt">
        <Link href="/prihlaseni">Zpět na přihlášení</Link>
      </p>
    </>
  );
}
