import { getCurrentUser } from "@/lib/session";
import { configuredUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Říká úvodnímu webu (classmate.cz), jestli je návštěvník přihlášený v aplikaci, aby místo „Přihlásit se“ mohl ukázat „Do aplikace“.
 * Vrací jen ano/ne a jen webu na stejné doméně (aplikace.classmate.cz → classmate.cz a www.classmate.cz); další adresy jdou v LANDING_ORIGINS (čárkami).
 */
function allowedOrigins(): string[] {
  const extra = (process.env.LANDING_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  const base = configuredUrl();
  if (!base) return extra;
  const u = new URL(base);
  const labels = u.hostname.split(".");
  if (labels.length < 3) return extra; // bez subdomény není co odvozovat
  const parent = labels.slice(1).join(".");
  return [...new Set([`${u.protocol}//${parent}`, `${u.protocol}//www.${parent}`, ...extra])];
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return Response.json({ in: !!user }, { headers });
}
