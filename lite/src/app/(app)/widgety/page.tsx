import { rotateKeyAction } from "../../actions";
import { ALL_WIDGETS, embedKey, embedOrigins, publicBase } from "@/lib/embed/core";
import { LITE_WIDGETS } from "@/lib/widgets";
import { Flash, type SP } from "../ui";
import { Copy } from "./Copy";

export const metadata = { title: "Widgety" };

export default async function WidgetsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const base = publicBase();
  const k = encodeURIComponent(embedKey());
  const origins = embedOrigins();
  return (
    <>
      <h1>Widgety</h1>
      <p className="sub">Vlož si rozvrh, známky, Komens a obědy do Classmate nebo jiného dashboardu.</p>
      <Flash sp={sp} />

      <h2>Plugin pro Classmate</h2>
      <div className="card stack">
        <p style={{ margin: 0 }}>V Classmate otevři <b>Nastavení → Pluginy → Přidat plugin z adresy</b> a vlož tuhle adresu. Nabídne rozvržení „Klasický Classmate“.</p>
        <Copy value={`${base}/embed/widgets.json?k=${k}`} />
        <p className="hint" style={{ margin: 0 }}>
          Vložit widgety smí: {origins.length ? origins.join(", ") : <b>jen tento server (doplň EMBED_ORIGINS v .env, např. https://classmate.cz)</b>}
          {base.startsWith("http://localhost") && <> · nastav <code>PUBLIC_URL</code>, jinak adresy ukazují na localhost</>}
        </p>
      </div>

      <h2>Kalendář (ICS)</h2>
      <div className="card stack">
        <p style={{ margin: 0 }}>Rozvrh tohoto a příštího týdne se suplováním. Vlož do Classmate (Nastavení → Můj kalendář), Google nebo Apple kalendáře.</p>
        <Copy value={`${base}/kalendar.ics?k=${k}`} />
      </div>

      <h2>Jednotlivé widgety</h2>
      <div className="grid">
        {ALL_WIDGETS.filter((w) => LITE_WIDGETS.includes(w.id)).map((w) => (
          <div key={w.id} className="card stack">
            <b>{w.title}</b>
            <iframe src={`/embed/${w.id}?k=${k}`} title={w.title} height={w.height} loading="lazy" sandbox="" style={{ border: "1px solid var(--line)" }} />
            <Copy value={`${base}/embed/${w.id}?k=${k}`} />
          </div>
        ))}
      </div>
      <p className="hint">Vzhled: přidej <code>&amp;theme=light</code> nebo <code>&amp;theme=dark</code>, průhledné pozadí <code>&amp;bg=transparent</code>.</p>

      <h2>Klíč</h2>
      <div className="card">
        <form action={rotateKeyAction} className="row">
          <span className="hint">Adresy obsahují tajný klíč jen pro čtení widgetů. Když unikne, vyměň ho.</span>
          <button className="btn danger small">Vyměnit klíč</button>
        </form>
      </div>
    </>
  );
}
