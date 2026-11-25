import { CopyField } from "@/components/CopyField";
import { ConfirmButton } from "@/components/forms";
import { rotateWidgetKey } from "@/app/actions/widgets";
import { ALL_WIDGETS, embedKey, embedOrigins, publicBase } from "@/lib/embed/core";
import { FULL_WIDGETS } from "@/lib/embed/data";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Widgety" };
export const dynamic = "force-dynamic";

export default async function WidgetsPage() {
  await requireAdmin();
  const base = publicBase();
  const k = encodeURIComponent(embedKey());
  const origins = embedOrigins();
  const widgets = ALL_WIDGETS.filter((w) => FULL_WIDGETS.includes(w.id));
  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Widgety</h1>
          <p className="subtitle">Propoj tenhle server s novým Classmate: stránky do menu, widgety na Dnes a rozvržení jako ve starém Classmate.</p>
        </div>
      </div>

      <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Propojení s Classmate</h2>
          <div className="card card-pad stack">
            <p style={{ margin: 0 }}>V novém Classmate otevři <b>Nastavení → Pluginy → Přidat web</b> a vlož adresu tohoto serveru:</p>
            <CopyField value={base} />
            <p className="hint" style={{ margin: 0 }}>Classmate si sám najde stránky (Rozvrh, Známky, Absence, Komens, Obědy, Úkoly, Testy, Poznámky, Studium), widgety a rozvržení „Klasický Classmate“. Žádné klíče se nekopírují: když bude potřeba, Classmate ukáže tlačítko a otevře okno s přihlášením.</p>
            <p className="hint" style={{ margin: 0 }}>
              Vložit tenhle server smí: {origins.length ? origins.join(", ") : <b>jen on sám. Doplň adresu nového Classmate do EMBED_ORIGINS v .env, třeba https://classmate.cz</b>}
              {base.startsWith("http://localhost") && <> · nastav <code>PUBLIC_URL</code>, jinak adresa ukazuje na localhost</>}
            </p>
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Widgety s klíčem (záloha)</h2>
          <div className="card rows">
            {widgets.map((w) => (
              <div key={w.id} className="kv" style={{ display: "block" }}>
                <strong>{w.title}</strong>
                <div style={{ marginTop: 8 }}><CopyField value={`${base}/embed/${w.id}?k=${k}`} /></div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 4px 0" }}>Pro jiné dashboardy nebo staré prohlížeče bez dělených cookies. Adresa obsahuje tajný klíč jen pro čtení widgetů.</p>
          <form action={rotateWidgetKey} style={{ marginTop: 10 }}><ConfirmButton message="Vytvořit nový klíč? Widgety vložené přes adresu s klíčem přestanou fungovat.">Vyměnit klíč</ConfirmButton></form>
        </section>
      </div>
    </div>
  );
}
