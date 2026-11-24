import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { schoolTrainingEnabled, trainingActive, yearLabel, currentPeriod } from "@/lib/training";
import { trainingWorkbook } from "@/lib/training-export";

export const dynamic = "force-dynamic";

/** Výsledná tabulka (Sportovní deník) za školní rok. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!schoolTrainingEnabled(user.school_id) || !trainingActive(user)) return new Response("Not found", { status: 404 });
  const z = Number(req.nextUrl.searchParams.get("z"));
  const year = Number.isInteger(z) && z > 2000 && z < 2200 ? z : currentPeriod().year;
  const file = `Sportovni-denik-${user.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "student"}-${yearLabel(year).replace("/", "-")}.xlsx`;
  const buf = await trainingWorkbook(user, year);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
