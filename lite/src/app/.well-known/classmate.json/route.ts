import { manifest, MANIFEST_HEADERS } from "@/lib/embed/core";
import { LITE_WIDGETS } from "@/lib/widgets";

export const dynamic = "force-dynamic";

/** Veřejný popis pluginu pro Classmate (bez dat a bez klíčů). */
export function GET() {
  return Response.json(
    manifest({
      name: "Bakaláři a obědy",
      description: "Rozvrh se suplováním, známky, absence a Komens z Bakalářů a obědy ze Strava.cz z tvého vlastního serveru.",
      icon: "star",
      widgets: LITE_WIDGETS,
      pages: [
        { id: "rozvrh", title: "Rozvrh z Bakalářů", path: "/rozvrh", icon: "calendar" },
        { id: "znamky", title: "Známky", path: "/znamky", icon: "star" },
        { id: "absence", title: "Absence", path: "/absence", icon: "absence" },
        { id: "komens", title: "Komens", path: "/komens", icon: "mail" },
        { id: "obedy", title: "Obědy", path: "/obedy", icon: "utensils" },
      ],
    }),
    { headers: MANIFEST_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...MANIFEST_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
