import { NextResponse, type NextRequest } from "next/server";

/**
 * Hlavičky pro vložení do Classmate: stránky a widgety smí vložit jen tento server a domény z `EMBED_ORIGINS`.
 * Skládá se za běhu (adresa Classmate není v době sestavení obrazu známá). Okno s přihlášením se vkládat nesmí.
 * (Middleware běží v edge runtime, proto si `EMBED_ORIGINS` čte sám a nesahá na moduly s node:fs.)
 */
const origins = () =>
  (process.env.EMBED_ORIGINS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));

const BASE = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"];

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const popup = req.nextUrl.pathname.startsWith("/classmate/login");
  const ancestors = popup ? "'none'" : ["'self'", ...origins()].join(" ");
  // v dev režimu Next potřebuje eval, plná CSP proto jen v produkci
  const csp = process.env.NODE_ENV === "production" ? [...BASE, `frame-ancestors ${ancestors}`] : [`frame-ancestors ${ancestors}`];
  res.headers.set("Content-Security-Policy", csp.join("; "));
  if (popup) res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|.well-known/|kalendar.ics).*)"] };
