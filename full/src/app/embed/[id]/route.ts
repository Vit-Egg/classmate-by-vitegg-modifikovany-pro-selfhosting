import { corsHeaders, embedHeaders, forbidden, keyOk, manifest, renderWidget, themeOf } from "@/lib/embed/core";
import { FULL_WIDGETS, widgetData } from "@/lib/embed/data";

export const dynamic = "force-dynamic";

/** Widgety pro nový Classmate a jiné dashboardy: /embed/<widget>?k=… a manifest pluginu /embed/widgets.json?k=… */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!keyOk(url.searchParams.get("k"))) return forbidden();
  if (id === "widgets.json") {
    const m = manifest({ name: "Classmate (vlastní server)", description: "Rozvrh, suplování, známky, absence, Komens, obědy, úkoly a testy z tvého vlastního Classmate.", widgets: FULL_WIDGETS, pages: [{ id: "rozvrh", title: "Rozvrh", path: "/embed/rozvrh", icon: "calendar" }] });
    return Response.json(m, { headers: { "Cache-Control": "private, no-store", ...corsHeaders(req.headers.get("origin")) } });
  }
  if (!FULL_WIDGETS.includes(id)) return new Response("Neznámý widget.", { status: 404 });
  const data = await widgetData(id);
  if (!data) return new Response("Server ještě není nastavený.", { status: 503 });
  return new Response(renderWidget(data, themeOf(url.searchParams.get("theme")), url.searchParams.get("bg") === "transparent"), { headers: embedHeaders() });
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
