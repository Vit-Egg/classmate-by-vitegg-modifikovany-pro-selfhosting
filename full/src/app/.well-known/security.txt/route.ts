import { siteUrl } from "@/lib/site";
import { DEFAULT_CONTACT } from "@/lib/contact";

export const dynamic = "force-dynamic";

/** Kam nahlásit bezpečnostní problém (RFC 9116). Použije se FEEDBACK_EMAIL, CONTACT_EMAIL, jinak kontakt@classmate.cz. */
export function GET() {
  const mail = process.env.FEEDBACK_EMAIL?.trim() || process.env.CONTACT_EMAIL?.trim() || DEFAULT_CONTACT;
  const expires = new Date(Date.now() + 300 * 86_400_000).toISOString();
  return new Response(`Contact: mailto:${mail}\nExpires: ${expires}\nPreferred-Languages: cs, en\nCanonical: ${siteUrl()}/.well-known/security.txt\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
