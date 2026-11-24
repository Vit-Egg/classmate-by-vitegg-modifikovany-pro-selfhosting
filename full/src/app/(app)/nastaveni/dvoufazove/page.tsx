import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmTotp, qrFor } from "@/app/actions/settings";
import { ActionForm, Submit } from "@/components/forms";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { decrypt } from "@/lib/crypto";

export const metadata = { title: "Dvoufázové ověření" };
export const dynamic = "force-dynamic";

export default async function TotpSetup() {
  const user = await requireUser();
  const row = get<{ totp_pending_enc: string | null }>("SELECT totp_pending_enc FROM users WHERE id = ?", user.id);
  if (!row?.totp_pending_enc) redirect("/nastaveni?k=ucet");
  const qr = await qrFor(row.totp_pending_enc, user.email);
  return (
    <div className="wide" style={{ maxWidth: 560 }}>
      <h1 className="title">Zapnout 2FA</h1>
      <p className="subtitle">Naskenuj kód v aplikaci pro ověřování (Google Authenticator, Authy, 2FAS…).</p>
      <div className="stack" style={{ marginTop: 24 }}>
        <div className="qr"><img src={qr} alt="QR kód pro 2FA" width={220} height={220} /></div>
        <p className="hint">Nejde naskenovat? Zadej klíč ručně:</p>
        <p className="mono">{decrypt(row.totp_pending_enc)}</p>
        <ActionForm action={confirmTotp} resetOnSuccess={false}>
          <label className="field"><span>Šestimístný kód z aplikace</span><input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required /></label>
          <div className="btn-row"><Submit>Zapnout</Submit><Link href="/nastaveni?k=ucet" className="btn">Hotovo</Link></div>
        </ActionForm>
      </div>
    </div>
  );
}
