/** Veřejná adresa aplikace z PUBLIC_URL. Prázdná nebo nesmyslná hodnota se ignoruje, nikdy nesmí shodit stránku. */
export function configuredUrl(): string | null {
  const raw = (process.env.PUBLIC_URL ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export const siteUrl = () => configuredUrl() ?? "http://localhost:3000";
