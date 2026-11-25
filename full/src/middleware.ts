import { NextResponse, type NextRequest } from "next/server";
import { crossSite } from "@/lib/origin";
import { analyticsConfig } from "@/lib/analytics";
import { buildCsp } from "@/lib/csp";

/**
 * Obrana proti CSRF pro všechny požadavky, které něco mění (POST, PUT, PATCH, DELETE): musí přijít ze stejného původu.
 * Cookie s relací má sice SameSite=Lax, tohle je druhá vrstva (starší prohlížeče, chyby v konfiguraci).
 * Výjimky jsou jen rozhraní, která se neověřují cookie: webhook Stripe (podpis), OAuth, MCP a API v1 (tokeny v hlavičce, volají je cizí aplikace).
 *
 * Nahrávání souborů k poznámce (zvuk, přílohy, obrázky) middlewarem neprochází: Next.js by tělo požadavku nad 10 MB oříznul (hodinová nahrávka by se uložila jen z první třetiny)
 * a držel by ho celé v paměti. Tyto trasy volají stejnou kontrolu `crossSite` samy.
 */
const EXEMPT = [/^\/api\/pokladna\/stripe\//, /^\/oauth\/(token|register|revoke)$/, /^\/mcp$/, /^\/api\/v1(\/|$)/];

/** Kdo smí aplikaci vložit do rámu: tento server a domény z EMBED_ORIGINS (nový Classmate s pluginem). Okno s přihlášením pro Classmate nikdo. */
function frameAncestors(path: string) {
  if (path.startsWith("/classmate/login")) return "'none'";
  const origins = (process.env.EMBED_ORIGINS ?? "").split(/[,\s]+/).map((s) => s.trim().replace(/\/+$/, "")).filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
  return ["'self'", ...origins].join(" ");
}

/** CSP se skládá za běhu: adresa statistiky (Umami) i adresy Classmate (EMBED_ORIGINS) nejsou v době sestavení obrazu známé. V dev režimu jen frame-ancestors. */
function next(req: NextRequest) {
  const res = NextResponse.next();
  const fa = frameAncestors(req.nextUrl.pathname);
  if (process.env.NODE_ENV === "production") res.headers.set("Content-Security-Policy", buildCsp(analyticsConfig()?.origin, fa));
  else res.headers.set("Content-Security-Policy", `frame-ancestors ${fa}`);
  return res;
}

export function middleware(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || EXEMPT.some((r) => r.test(req.nextUrl.pathname))) return next(req);
  if (crossSite(req.headers)) return new NextResponse("Forbidden", { status: 403 });
  return next(req);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|poznamky/\\d+/(?:audio|priloha|obrazek)$).*)"] };
