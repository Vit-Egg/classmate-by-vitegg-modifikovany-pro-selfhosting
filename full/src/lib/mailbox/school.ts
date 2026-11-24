import { get } from "../db";

export type SchoolMail = { kind: "microsoft" | "imap"; domain: string; imapHost: string | null; imapPort: number | null; smtpHost: string | null; smtpPort: number | null };

type Row = { mail_kind: string | null; mail_domain: string | null; mail_imap_host: string | null; mail_imap_port: number | null; mail_smtp_host: string | null; mail_smtp_port: number | null; ms_domain: string | null; ms_enabled: number };
const row = (schoolId: number) => get<Row>("SELECT mail_kind, mail_domain, mail_imap_host, mail_imap_port, mail_smtp_host, mail_smtp_port, ms_domain, ms_enabled FROM schools WHERE id = ?", schoolId);

/** Koncovka školního Microsoft 365 (např. ssps.cz), nebo null, když škola Microsoft 365 nemá nastavený. Slouží Teams i poště přes Microsoft. */
export const schoolMicrosoft = (schoolId: number): string | null => { const r = row(schoolId); return r?.ms_enabled && r.ms_domain ? r.ms_domain : null; };

/** Jak je školní e-mail nastavený u školy: přes Microsoft 365 (koncovka je v nastavení Microsoft 365), nebo vlastní IMAP/SMTP. null = pošta není nastavená. */
export function schoolMail(schoolId: number): SchoolMail | null {
  const r = row(schoolId);
  if (r?.mail_kind === "microsoft" && r.ms_enabled && r.ms_domain) return { kind: "microsoft", domain: r.ms_domain, imapHost: null, imapPort: null, smtpHost: null, smtpPort: null };
  if (r?.mail_kind === "imap" && r.mail_domain && r.mail_imap_host && r.mail_smtp_host) return { kind: "imap", domain: r.mail_domain, imapHost: r.mail_imap_host, imapPort: r.mail_imap_port, smtpHost: r.mail_smtp_host, smtpPort: r.mail_smtp_port };
  return null;
}

export const microsoftConfigured = () => !!process.env.MS_CLIENT_ID?.trim() && !!process.env.MS_CLIENT_SECRET?.trim();

/** Patří adresa do domény školy (přesně, nebo jako poddoména, např. student.ssps.cz)? */
export function inDomain(address: string, domain: string) {
  const host = address.trim().toLowerCase().split("@")[1] ?? "";
  const d = domain.toLowerCase();
  return host === d || host.endsWith("." + d);
}

/** Texty pro návrat z přihlášení k Microsoftu (parametr ?chyba=). */
export const MAIL_ERRORS: Record<string, string> = {
  stav: "Přihlášení vypršelo, zkus to znovu.",
  zamitnuto: "Přístup jsi nepovolil/a.",
  domena: "Tenhle účet nepatří tvé škole. Přihlas se školním účtem.",
  microsoft: "Přihlášení k Microsoftu se nepovedlo. Škola může vyžadovat souhlas správce, zeptej se školního IT.",
};
