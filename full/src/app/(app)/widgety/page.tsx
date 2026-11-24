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
          <p className="subtitle">Vlož si rozvrh, známky, obědy a další do nového Classmate nebo jiného dashboardu.</p>
        </div>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 className="group-title">Plugin pro Classmate</h2>
        <div className="card card-pad stack" style={{ maxWidth: 760 }}>
          <p style={{ margin: 0 }}>V novém Classmate otevři <b>Nastavení → Pluginy → Přidat plugin z adresy</b> a vlož tuhle adresu. Nabídne ti rozvržení „Klasický Classmate“.</p>
          <CopyField value={`${base}/embed/widgets.json?k=${k}`} />
          <p className="hint" style={{ margin: 0 }}>
            Vložit widgety smí: {origins.length ? origins.join(", ") : <b>nikdo (doplň EMBED_ORIGINS v .env, např. https://classmate.cz)</b>}.
            {base.startsWith("http://localhost") && <> Nastav také <code>PUBLIC_URL</code>, jinak adresy ukazují na localhost.</>}
          </p>
          <p className="hint" style={{ margin: 0 }}>Propojení bez kopírování: Classmate může otevřít <code>{base}/classmate/connect?origin=…</code>.</p>
          <form action={rotateWidgetKey}><ConfirmButton message="Vytvořit nový klíč? Všechny vložené widgety a přidaný plugin přestanou fungovat, dokud je nepřidáš znovu.">Vyměnit klíč</ConfirmButton></form>
        </div>
      </section>

      <section>
        <h2 className="group-title">Jednotlivé widgety</h2>
        <div className="auto-cols">
          {widgets.map((w) => {
            const src = `${base}/embed/${w.id}?k=${k}`;
            return (
              <div key={w.id} className="card card-pad stack">
                <strong>{w.title}</strong>
                <iframe src={`/embed/${w.id}?k=${k}`} title={w.title} style={{ width: "100%", height: w.height, border: 0, borderRadius: 10 }} sandbox="" loading="lazy" />
                <CopyField value={src} />
              </div>
            );
          })}
        </div>
        <p className="hint" style={{ margin: "10px 4px 0" }}>Vzhled: přidej <code>&amp;theme=light</code> nebo <code>&amp;theme=dark</code>, průhledné pozadí <code>&amp;bg=transparent</code>.</p>
      </section>
    </div>
  );
}
