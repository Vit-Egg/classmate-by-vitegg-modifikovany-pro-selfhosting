import { manifest, MANIFEST_HEADERS } from "@/lib/embed/core";
import { FULL_WIDGETS } from "@/lib/embed/data";

export const dynamic = "force-dynamic";

/** Veřejný popis pluginu pro Classmate (bez dat a bez klíčů). */
export function GET() {
  return Response.json(
    manifest({
      name: "Classmate (vlastní server)",
      description: "Rozvrh, známky, absence a Komens z Bakalářů, obědy ze Strava.cz, úkoly, testy a poznámky z tvého vlastního Classmate.",
      icon: "star",
      widgets: FULL_WIDGETS,
      pages: [
        { id: "rozvrh", title: "Rozvrh z Bakalářů", path: "/rozvrh", icon: "calendar" },
        { id: "znamky", title: "Známky", path: "/znamky", icon: "star" },
        { id: "absence", title: "Absence", path: "/absence", icon: "absence" },
        { id: "komunikace", title: "Komens", path: "/komunikace", icon: "mail" },
        { id: "obedy", title: "Obědy", path: "/obedy", icon: "utensils" },
        { id: "ukoly", title: "Moje úkoly", path: "/ukoly", icon: "check" },
        { id: "testy", title: "Moje testy", path: "/testy-a-zkouseni", icon: "exam" },
        { id: "poznamky", title: "Moje poznámky", path: "/poznamky", icon: "pen" },
        { id: "studium", title: "Studium", path: "/studium", icon: "cap" },
      ],
    }),
    { headers: MANIFEST_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...MANIFEST_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
