import { redirect } from "next/navigation";
import { loggedIn } from "@/lib/auth";
import { connectCsp, connectPage, embedKey, publicBase } from "@/lib/embed/core";

export const dynamic = "force-dynamic";

/** Propojení s Classmate bez kopírování adres: po potvrzení pošle adresu manifestu oknu Classmate přes postMessage. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await loggedIn())) redirect(`/prihlaseni?next=${encodeURIComponent(url.pathname + url.search)}`);
  const html = connectPage(url.searchParams.get("origin"), `${publicBase()}/embed/widgets.json?k=${encodeURIComponent(embedKey())}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": connectCsp, "X-Frame-Options": "DENY" } });
}
