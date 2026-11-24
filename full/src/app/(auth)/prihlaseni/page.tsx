import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, Submit } from "@/components/forms";
import { mailConfigured } from "@/lib/mail";
import { getCurrentUser } from "@/lib/session";
import { needsSetup } from "@/lib/setup";

export const metadata = { title: "Přihlášení" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = sp.next;
  const safe = next && /^\/(?![/\\])/.test(next) ? next : "";
  if (needsSetup()) redirect("/zprovozneni");
  if (await getCurrentUser()) redirect(safe || "/dnes");
  return (
    <>
      <h1>Vítej zpět</h1>
      {sp.reset && <p className="msg-ok" role="status">Heslo je změněné. Přihlas se novým heslem.</p>}
      <ActionForm action={loginAction} resetOnSuccess={false}>
        {safe && <input type="hidden" name="next" value={safe} />}
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>Heslo</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>
        <div style={{ height: 8 }} />
        <Submit className="btn primary big">Přihlásit se</Submit>
      </ActionForm>
      {mailConfigured() && <p className="alt" style={{ marginTop: 14 }}><Link href="/zapomenute-heslo">Zapomněl(a) jsi heslo?</Link></p>}
    </>
  );
}
