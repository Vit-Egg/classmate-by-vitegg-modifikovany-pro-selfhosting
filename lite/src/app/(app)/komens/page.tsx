import Link from "next/link";
import { Icon } from "@/components/Icon";
import { komens } from "@/lib/bk";
import { Flash, Head, SyncButton, type SP } from "../ui";

export const metadata = { title: "Komens" };

const when = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
};

/** Jen čtení: zprávy se tu neodesílají a v Bakalářích se neoznačují jako přečtené. */
export default async function KomensPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const box = sp.t === "nastenka" ? "noticeboard" : "received";
  const list = await komens(box);
  return (
    <div className="wide">
      <Head title="Komens" sub="Zprávy ze školy, jen ke čtení">
        <SyncButton back={`/komens${box === "noticeboard" ? "?t=nastenka" : ""}`} />
      </Head>
      <Flash sp={sp} />
      <div className="toolbar">
        <nav className="seg" aria-label="Složka">
          <Link href="/komens" aria-current={box === "received"}>Přijaté</Link>
          <Link href="/komens?t=nastenka" aria-current={box === "noticeboard"}>Nástěnka</Link>
        </nav>
      </div>
      {!list ? (
        <div className="empty">Zprávy zatím nejsou načtené.</div>
      ) : !list.length ? (
        <div className="empty">Žádné zprávy.</div>
      ) : (
        <div className="card rows" style={{ maxWidth: 900 }}>
          {list.slice(0, 80).map((m) => (
            <details key={m.id} className={`msg${m.read ? "" : " unread"}`} style={{ display: "block" }}>
              <summary style={{ display: "flex", gap: 14, alignItems: "center", cursor: "pointer", padding: "14px 20px", listStyle: "none" }}>
                <span className="msg-icon"><Icon name="mail" size={16} /></span>
                <span className="msg-main">
                  <b>{m.title}</b>
                  <small className="hint" style={{ margin: 0 }}>{m.sender} · {when(m.sentAt)}</small>
                </span>
                {!m.read && <span className="badge accent">nové</span>}
              </summary>
              <p style={{ whiteSpace: "pre-wrap", padding: "0 20px 18px 68px", margin: 0, lineHeight: 1.55 }}>{m.text}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
