/** Požadavek, který něco mění, musí přijít ze stejného původu (obrana proti CSRF). Používá middleware i trasy, které middleware obchází. */
export function crossSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}
