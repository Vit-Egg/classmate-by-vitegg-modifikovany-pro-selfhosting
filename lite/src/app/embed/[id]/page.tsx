import { notFound } from "next/navigation";
import { CmLogin } from "@/components/CmLogin";
import { EmbedWidget } from "@/components/EmbedWidget";
import { loggedIn } from "@/lib/auth";
import { ALL_WIDGETS, keyOk } from "@/lib/embed/core";
import { LITE_WIDGETS, widgetData } from "@/lib/widgets";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Widget pro Classmate: přístup přes přihlášení (v Classmate dělená cookie) nebo záložní klíč `?k=`. Čte jen z místní databáze. */
export default async function EmbedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k } = await searchParams;
  if (!LITE_WIDGETS.includes(id)) notFound();
  const w = ALL_WIDGETS.find((x) => x.id === id)!;
  if (!keyOk(k) && !(await loggedIn())) {
    return <div className="embed-page"><CmLogin always name="Classmate lite" /></div>;
  }
  const data = await widgetData(id);
  return <div className="embed-page">{data && <EmbedWidget data={data} title={w.title} />}</div>;
}
