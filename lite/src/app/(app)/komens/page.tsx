import Link from "next/link";
import { komens } from "@/lib/bk";
import { Flash, SyncButton, type SP } from "../ui";

export const metadata = { title: "Komens" };

const when = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
};

/** Jen čtení: zprávy se tu neodesílají a ani se v Bakalářích neoznačují jako přečtené. */
export default async function KomensPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const box = sp.w === "nastenka" ? "noticeboard" : "received";
  const list = await komens(box);
  return (
    <>
      <div className="head">
        <div>
          <h1>Komens</h1>
          <p className="sub">Jen ke čtení · přečtení v Bakalářích se tím nemění</p>
        </div>
        <SyncButton back={`/komens${box === "noticeboard" ? "?w=nastenka" : ""}`} />
      </div>
      <Flash sp={sp} />
      <div className="row" style={{ marginBottom: 14 }}>
        <Link className="btn small" href="/komens" style={box === "received" ? { fontWeight: 600 } : undefined}>Přijaté</Link>
        <Link className="btn small" href="/komens?w=nastenka" style={box === "noticeboard" ? { fontWeight: 600 } : undefined}>Nástěnka</Link>
      </div>
      <div className="card">
        {!list ? (
          <span className="mut">Zprávy zatím nejsou načtené.</span>
        ) : !list.length ? (
          <span className="mut">Žádné zprávy.</span>
        ) : (
          list.slice(0, 60).map((m) => (
            <details key={m.id}>
              <summary>
                <b style={{ fontWeight: m.read ? 500 : 700 }}>{m.title}</b> <span className="mut">· {m.sender} · {when(m.sentAt)}</span>
                {!m.read && <span className="chip" style={{ marginLeft: 6 }}>nepřečteno</span>}
              </summary>
              <p className="pre">{m.text}</p>
            </details>
          ))
        )}
      </div>
    </>
  );
}
