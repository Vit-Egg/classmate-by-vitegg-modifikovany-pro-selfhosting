import { redirect } from "next/navigation";
import { connectCsp, connectPage, embedKey, publicBase } from "@/lib/embed/core";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Propojení s novým Classmate bez kopírování adres: Classmate otevře tuto stránku, po potvrzení dostane adresu manifestu přes postMessage. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) redirect(`/prihlaseni?next=${encodeURIComponent(url.pathname + url.search)}`);
  const html = connectPage(url.searchParams.get("origin"), `${publicBase()}/embed/widgets.json?k=${encodeURIComponent(embedKey())}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": connectCsp, "X-Frame-Options": "DENY" } });
}
