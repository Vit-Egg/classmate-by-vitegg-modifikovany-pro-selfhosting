import { endDemo } from "@/app/actions/demo";
import { logoutAction } from "@/app/actions/auth";

const left = (until: number) => {
  const min = Math.max(0, Math.round((until - Date.now()) / 60_000));
  if (min >= 90) return `${Math.round(min / 60)} h`;
  return min >= 1 ? `${min} min` : "chvíli";
};

/** Lišta nahoře v ukázkovém účtu: připomíná, že data jsou vymyšlená, a nabízí přechod na skutečný účet. */
export function DemoBanner({ expiresAt }: { expiresAt: number | null }) {
  return (
    <div className="demo-banner" role="note">
      <div className="demo-text">
        <b>Demo.</b> Všechno tady je vymyšlené{expiresAt ? <>, smaže se za {left(expiresAt)}</> : null}. Zkus si, co chceš.
      </div>
      <div className="demo-actions">
        {expiresAt ? (
          <>
            <form action={endDemo}>
              <input type="hidden" name="to" value="register" />
              <button className="btn small primary">Vytvořit si účet</button>
            </form>
            <form action={endDemo}>
              <button className="btn small">Ukončit demo</button>
            </form>
          </>
        ) : (
          <form action={logoutAction}>
            <button className="btn small">Odhlásit se</button>
          </form>
        )}
      </div>
    </div>
  );
}
