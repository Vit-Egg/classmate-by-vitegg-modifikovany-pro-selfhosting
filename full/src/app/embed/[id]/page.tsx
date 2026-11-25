import { notFound } from "next/navigation";
import { CmLogin } from "@/components/CmLogin";
import { EmbedWidget } from "@/components/EmbedWidget";
import { ALL_WIDGETS, keyOk } from "@/lib/embed/core";
import { FULL_WIDGETS, widgetData } from "@/lib/embed/data";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Widget pro Classmate: přístup přes přihlášení (v Classmate dělená cookie) nebo záložní klíč `?k=`. Čte jen z paměti serveru. */
export default async function EmbedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k } = await searchParams;
  if (!FULL_WIDGETS.includes(id)) notFound();
  const w = ALL_WIDGETS.find((x) => x.id === id)!;
  if (!keyOk(k) && !(await getCurrentUser())) {
    return <div className="embed-page"><CmLogin always name="Classmate" /></div>;
  }
  const data = await widgetData(id);
  return <div className="embed-page">{data && <EmbedWidget data={data} title={w.title} />}</div>;
}
