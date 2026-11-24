import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { changeEmail, resendEmailConfirmation } from "@/app/actions/settings";
import { ActionForm, Submit } from "@/components/forms";
import { ResendConfirmation } from "@/components/ResendConfirmation";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Potvrď e-mail" };
export const dynamic = "force-dynamic";

/** Brána po registraci: dokud uživatel nepotvrdí e-mail, do aplikace se nedostane. */
export default async function VerifyEmail() {
  const user = await requireUser();
  if (!user.email_gate || user.email_confirmed_for === user.email) redirect("/dnes");
  return (
    <>
      <h1>Potvrď svůj e-mail</h1>
      <p className="hint" style={{ marginBottom: 14 }}>Poslali jsme odkaz na <b>{user.email}</b>. Klikni na něj a pak se vrať sem. Zkontroluj i spam.</p>
      <a className="btn primary big" href="/overit-email">Už jsem potvrdil(a)</a>
      <div style={{ height: 14 }} />
      <ResendConfirmation action={resendEmailConfirmation} />
      <details style={{ marginTop: 22 }}>
        <summary className="hint" style={{ cursor: "pointer" }}>Špatná adresa? Změnit e-mail</summary>
        <ActionForm action={changeEmail} resetOnSuccess={false}>
          <label className="field"><span>Správný e-mail</span><input className="input" type="email" name="email" required defaultValue={user.email} /></label>
          <label className="field"><span>Tvoje heslo</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
          <Submit>Změnit a poslat potvrzení</Submit>
        </ActionForm>
      </details>
      <form action={logoutAction} style={{ marginTop: 22 }}><button className="link-btn">Odhlásit se</button></form>
    </>
  );
}
