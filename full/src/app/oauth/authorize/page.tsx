import { redirect } from "next/navigation";
import { approveAuthorization, denyAuthorization } from "../actions";
import { Submit } from "@/components/forms";
import { validateAuthRequest } from "@/lib/oauth";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const req = validateAuthRequest(sp);
  if ("error" in req) {
    return (
      <div className="consent">
        <div className="brand-name">Classmate</div>
        <h1>Připojení se nepovedlo</h1>
        <p className="hint">{req.error}</p>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    const here = "/oauth/authorize?" + new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    redirect(`/prihlaseni?next=${encodeURIComponent(here)}`);
  }
  if (user.demo) redirect("/nastaveni"); // ukázkový účet se k AI aplikacím připojit nedá
  const host = new URL(req.redirectUri);
  const hidden = (
    <>
      {Object.entries({ client_id: req.client.id, redirect_uri: req.redirectUri, response_type: "code", code_challenge: req.challenge, code_challenge_method: "S256", state: req.state }).map(
        ([k, v]) => v !== undefined && <input key={k} type="hidden" name={k} value={v} />,
      )}
    </>
  );
  return (
    <div className="consent">
      <div className="brand-name">Classmate</div>
      <h1>Povolit přístup?</h1>
      <p className="consent-lead">
        <b>{req.client.name}</b> se chce připojit k účtu <b>{user.name}</b> ({user.school_name} · {user.class_name}).
      </p>
      <ul className="consent-list">
        <li>Bude moct dělat <b>totéž co ty</b>: číst rozvrh, známky, úkoly, testy a zkoušení a poznámky a zakládat, upravovat a mazat úkoly, testy a zkoušení a poznámky.</li>
        <li>Nikdy nezíská tvé heslo ani kódy dvoufázového ověření a nemůže měnit heslo, e-mail ani zabezpečení.</li>
        {user.role === "admin" && <li className="warn">Jsi správce, takže bude moct dělat i správcovské akce (školy, třídy, uživatelé).</li>}
      </ul>
      <p className="hint">Po schválení se vrátíš do aplikace na <b>{host.protocol === "http:" || host.protocol === "https:" ? host.host : host.protocol}</b>. Přístup můžeš kdykoliv odebrat v Nastavení.</p>
      <div className="consent-actions">
        <form action={denyAuthorization}>
          {hidden}
          <Submit className="btn">Zrušit</Submit>
        </form>
        <form action={approveAuthorization}>
          {hidden}
          <Submit className="btn primary">Povolit</Submit>
        </form>
      </div>
    </div>
  );
}
