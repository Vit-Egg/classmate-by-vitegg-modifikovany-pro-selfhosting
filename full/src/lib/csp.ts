/** Content-Security-Policy aplikace. `analytics` je adresa vlastní statistiky (Umami), kterou je potřeba povolit pro skript i odesílání dat. */
export function buildCsp(analytics?: string, frameAncestors = "'none'") {
  const a = analytics ? ` ${analytics}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${a}`, // Next.js a inicializace motivu používají inline skripty
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    `connect-src 'self' data: blob:${a}`,
    "worker-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
