import Link from "next/link";
import { DEVLOG } from "@/lib/devlog";
import { fmtFull } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { versionTitle } from "@/lib/version";

export const metadata = { title: "Devlog" };

export default async function DevlogPage() {
  await requireUser();
  return (
    <div className="wide">
      <Link href="/nastaveni" className="link-all">← Nastavení</Link>
      <div className="page-head" style={{ marginTop: 14 }}>
        <div>
          <h1 className="title">Devlog</h1>
          <p className="subtitle">Co se v aplikaci změnilo · {versionTitle()}</p>
        </div>
      </div>
      <ol className="devlog">
        {DEVLOG.map((e, i) => (
          <li key={i}>
            <div className="dl-date">{fmtFull(e.date)}</div>
            <div className="card card-pad">
              <h2 className="section">{e.title}</h2>
              <ul>
                {e.items.map((t, j) => <li key={j}>{t}</li>)}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
