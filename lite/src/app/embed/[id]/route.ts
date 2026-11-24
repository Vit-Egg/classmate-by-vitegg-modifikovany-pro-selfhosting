import { corsHeaders, embedHeaders, forbidden, keyOk, manifest, renderWidget, themeOf } from "@/lib/embed/core";
import { LITE_WIDGETS, widgetData } from "@/lib/widgets";

export const dynamic = "force-dynamic";

/** Widgety: /embed/<widget>?k=… a manifest pluginu pro Classmate /embed/widgets.json?k=… */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!keyOk(url.searchParams.get("k"))) return forbidden();
  if (id === "widgets.json") {
    const m = manifest({ name: "Bakaláři a obědy (lite)", description: "Rozvrh, suplování, známky, průměry, absence, Komens a obědy ze Strava.cz z tvého vlastního serveru.", widgets: LITE_WIDGETS, pages: [{ id: "rozvrh", title: "Rozvrh", path: "/embed/rozvrh", icon: "calendar" }] });
    return Response.json(m, { headers: { "Cache-Control": "private, no-store", ...corsHeaders(req.headers.get("origin")) } });
  }
  if (!LITE_WIDGETS.includes(id)) return new Response("Neznámý widget.", { status: 404 });
  const data = await widgetData(id);
  if (!data) return new Response("Neznámý widget.", { status: 404 });
  return new Response(renderWidget(data, themeOf(url.searchParams.get("theme")), url.searchParams.get("bg") === "transparent"), { headers: embedHeaders() });
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
