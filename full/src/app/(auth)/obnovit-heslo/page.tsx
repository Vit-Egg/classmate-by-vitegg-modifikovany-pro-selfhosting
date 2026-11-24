import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/password";
import { ActionForm, Submit } from "@/components/forms";
import { resetTokenUser } from "@/lib/password-reset";

export const metadata = { title: "Nové heslo" };
export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = (await searchParams).t ?? "";
  const user = t ? resetTokenUser(t) : null;
  if (!user)
    return (
      <>
        <h1>Odkaz nefunguje</h1>
        <p className="hint">Odkaz je neplatný, vypršel, nebo už byl použit. Požádej o nový.</p>
        <p className="alt"><Link href="/zapomenute-heslo">Poslat nový odkaz</Link></p>
      </>
    );
  return (
    <>
      <h1>Nové heslo</h1>
      <p className="hint" style={{ marginBottom: 18 }}>Pro účet {user.email}. Po změně tě odhlásíme na všech zařízeních.</p>
      <ActionForm action={resetPasswordAction} resetOnSuccess={false}>
        <input type="hidden" name="t" value={t} />
        <label className="field">
          <span>Nové heslo</span>
          <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required autoFocus />
        </label>
        <label className="field">
          <span>Nové heslo znovu</span>
          <input className="input" type="password" name="password2" autoComplete="new-password" minLength={8} required />
        </label>
        <p className="hint" style={{ margin: 0 }}>Aspoň 8 znaků. Máš-li zapnuté dvoufázové ověření, zůstává v platnosti.</p>
        <div style={{ height: 8 }} />
        <Submit className="btn primary big">Nastavit heslo</Submit>
      </ActionForm>
    </>
  );
}
