import Link from "next/link";
import { EmbedWidget } from "@/components/EmbedWidget";
import { bkConfigured, bkInfo } from "@/lib/bk";
import { greeting, pragueNow, fmtFull } from "@/lib/dates";
import { ALL_WIDGETS } from "@/lib/embed/core";
import { widgetData } from "@/lib/widgets";
import { Flash, SyncButton, type SP } from "../ui";

export const metadata = { title: "Dnes" };

const LEFT = ["rozvrh", "znamky", "absence"];
const RIGHT = ["suplovani", "prumery", "komens", "obedy"];

/** Nástěnka jako ve starém Classmate, poskládaná ze stejných widgetů, které jdou vložit do Classmate. */
export default async function Today({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const now = pragueNow();
  const first = (bkInfo().name ?? "").split(" ").slice(-1)[0];
  const col = async (ids: string[]) =>
    Promise.all(
      ids.map(async (id) => {
        const data = await widgetData(id);
        const w = ALL_WIDGETS.find((x) => x.id === id)!;
        return data ? <EmbedWidget key={id} data={data} title={w.title} /> : null;
      }),
    );
  const [l, r] = await Promise.all([col(LEFT), col(RIGHT)]);
  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">{fmtFull(now.date)}</p>
          <h1 className="title hero">{greeting(now.hour)}{first ? `, ${first}` : ""}</h1>
        </div>
        {bkConfigured() && <div className="head-actions"><SyncButton back="/dnes" /></div>}
      </div>
      <Flash sp={sp} />
      {!bkConfigured() && (
        <div className="card card-pad" style={{ marginBottom: 24, maxWidth: 640 }}>
          <h2 className="section" style={{ marginBottom: 6 }}>Bakaláři zatím nejsou propojení</h2>
          <p className="hint" style={{ margin: "0 0 14px" }}>Stačí adresa Bakalářů tvé školy, jméno a heslo.</p>
          <Link href="/nastaveni" className="btn primary">Propojit v Nastavení</Link>
        </div>
      )}
      <div className="grid-2">
        <div className="stack-lg">{l}</div>
        <div className="stack-lg">{r}</div>
      </div>
    </div>
  );
}
