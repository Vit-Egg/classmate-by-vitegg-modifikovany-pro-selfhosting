import type { MetadataRoute } from "next";

/** Server je soukromý: nic se neindexuje. Veřejnou prezentaci a SEO řeší úvodní web (samostatný projekt classmate-landing). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
