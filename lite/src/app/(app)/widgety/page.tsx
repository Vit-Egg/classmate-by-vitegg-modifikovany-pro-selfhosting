import { rotateKeyAction } from "../../actions";
import { ALL_WIDGETS, embedKey, embedOrigins, publicBase } from "@/lib/embed/core";
import { LITE_WIDGETS } from "@/lib/widgets";
import { Flash, Head, type SP } from "../ui";
import { Copy } from "./Copy";

export const metadata = { title: "Widgety" };

export default async function WidgetsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const base = publicBase();
  const k = encodeURIComponent(embedKey());
  const origins = embedOrigins();
  return (
    <div className="wide">
      <Head title="Widgety" sub="Propoj tenhle server s Classmate: stránky do menu, widgety na Dnes a rozvržení jako ve starém Classmate." />
      <Flash sp={sp} />
      <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Propojení s Classmate</h2>
          <div className="card card-pad stack">
            <p style={{ margin: 0 }}>V Classmate otevři <b>Nastavení → Pluginy → Přidat web</b> a vlož adresu tohoto serveru:</p>
            <Copy value={base} />
            <p className="hint" style={{ margin: 0 }}>Classmate si sám najde, co tenhle server nabízí (stránky Rozvrh, Známky, Absence, Komens a Obědy, widgety a rozvržení „Klasický Classmate“). Žádné tajné klíče se nekopírují: když bude potřeba, Classmate ukáže tlačítko a otevře okno s přihlášením.</p>
            <p className="hint" style={{ margin: 0 }}>
              Vložit tenhle server smí: {origins.length ? origins.join(", ") : <b>jen on sám. Doplň adresu svého Classmate do EMBED_ORIGINS v .env, třeba https://classmate.cz</b>}
              {base.startsWith("http://localhost") && <> · nastav <code>PUBLIC_URL</code>, jinak adresa ukazuje na localhost</>}
            </p>
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Kalendář (ICS)</h2>
          <div className="card card-pad stack">
            <p style={{ margin: 0 }}>Rozvrh tohoto a příštího týdne se suplováním, třeba pro Classmate (Nastavení → Můj kalendář), Google nebo Apple kalendář.</p>
            <Copy value={`${base}/kalendar.ics?k=${k}`} />
          </div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Widgety s klíčem (záloha)</h2>
          <div className="card rows">
            {ALL_WIDGETS.filter((w) => LITE_WIDGETS.includes(w.id)).map((w) => (
              <div key={w.id} className="kv" style={{ display: "block" }}>
                <strong>{w.title}</strong>
                <div style={{ marginTop: 8 }}><Copy value={`${base}/embed/${w.id}?k=${k}`} /></div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: "10px 4px 0" }}>Pro jiné dashboardy nebo staré prohlížeče bez dělených cookies. Adresa obsahuje tajný klíč jen pro čtení widgetů a kalendáře.</p>
          <form action={rotateKeyAction} style={{ marginTop: 10 }}><button className="btn small danger">Vyměnit klíč</button></form>
        </section>
      </div>
    </div>
  );
}
