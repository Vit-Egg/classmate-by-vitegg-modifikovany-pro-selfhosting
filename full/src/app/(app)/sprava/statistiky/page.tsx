import Link from "next/link";
import { AdminStats } from "@/components/AdminStats";
import { adminStats } from "@/lib/adminstats";
import { fmtDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Statistiky" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  await requireAdmin();
  const s = adminStats();
  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Statistiky</h1>
          <p className="subtitle">Jen souhrny celé instance, bez jednotlivých lidí. Demo účty se nepočítají · stav k {fmtDateTime(s.generatedAt)}</p>
        </div>
        <div className="btn-row"><Link href="/sprava" className="btn">Zpět do Správy</Link></div>
      </div>
      <AdminStats s={s} />
    </div>
  );
}
