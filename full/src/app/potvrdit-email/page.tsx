import Link from "next/link";
import { confirmEmailAction } from "@/app/actions/email";
import { verifyToken } from "@/lib/mail-tokens";

export const metadata = { title: "Potvrzení e-mailu" };
export const dynamic = "force-dynamic";

/** Cíl odkazu z potvrzovacího e-mailu. Potvrzuje se až tlačítkem, aby adresu nepotvrdil automat, který odkazy v poště jen prochází. */
export default async function ConfirmEmail({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string }> }) {
  const sp = await searchParams;
  const valid = !!sp.t && !!verifyToken(sp.t, "confirm");
  return (
    <main className="main prose" style={{ margin: "0 auto" }}>
      <h1 className="title">{sp.ok ? "Hotovo, e-mail je potvrzený" : "Potvrdit e-mail"}</h1>
      {sp.ok ? (
        <>
          <p>Díky. Teď můžeš Classmate používat a v Nastavení si zapnout e-mailová upozornění.</p>
          <p><Link href="/dnes" className="btn primary">Otevřít aplikaci</Link></p>
        </>
      ) : valid ? (
        <form action={confirmEmailAction}>
          <input type="hidden" name="t" value={sp.t} />
          <p>Potvrď, že tahle adresa je tvoje a chceš na ni dostávat upozornění z Classmate.</p>
          <button className="btn primary">Potvrdit e-mail</button>
        </form>
      ) : (
        <>
          <p>Odkaz je neplatný nebo už vypršel. V Nastavení můžeš poslat nový.</p>
          <p><Link href="/nastaveni" className="btn">Otevřít Nastavení</Link></p>
        </>
      )}
    </main>
  );
}
