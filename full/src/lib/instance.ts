/**
 * Instance: každý server Classmate je úplně samostatný (vlastní databáze, uživatelé, školy a třídy, API klíče, pošta, adresa, klíče pro oznámení).
 * Nic se mezi servery nesdílí a o sobě nevědí. Co instance umí a jak je nastavená, se čte z prostředí (.env) a z databáze; tady je to na jednom místě
 * pro Správu a pro stránky, které musí říct, kdo server provozuje.
 */
import { configuredUrl } from "./site";
import { DEFAULT_CONTACT } from "./contact";
import { mailConfigured } from "./mail";
import { fcmEnabled } from "./fcm";
import { aiEnabled } from "./ai";
import { microsoftConfigured } from "./mailbox/school";
import { todoistOAuthConfigured } from "./todoist";
import { activeDemos, demoHours, demoPublicEnabled } from "./demo-visitor";

const env = (k: string) => process.env[k]?.trim() ?? "";

/** Kdo server provozuje (OPERATOR_NAME, OPERATOR_URL) a kam se na něj dá napsat (FEEDBACK_EMAIL, jinak CONTACT_EMAIL, jinak kontakt@classmate.cz). */
export const operator = () => ({ name: env("OPERATOR_NAME"), url: env("OPERATOR_URL"), email: env("FEEDBACK_EMAIL") || env("CONTACT_EMAIL") || DEFAULT_CONTACT });

export type StatusItem = { label: string; ok: boolean; hint: string };

/** Co je na téhle instanci zapnuté. Bez tajných hodnot, jen ano/ne a kde se to nastavuje. */
export function instanceStatus(): StatusItem[] {
  const url = configuredUrl();
  return [
    { label: "Veřejná adresa (PUBLIC_URL)", ok: !!url, hint: url ?? "nenastaveno, odkazy v e-mailech, OAuth a MCP by mířily špatně" },
    { label: "Odesílání e-mailů (SMTP)", ok: mailConfigured(), hint: mailConfigured() ? "zapnuto" : "SMTP_HOST a SMTP_FROM v .env; bez něj nejde potvrzení e-mailu, zapomenuté heslo ani upozornění e-mailem" },
    { label: "Umělá inteligence (Google AI)", ok: aiEnabled(), hint: aiEnabled() ? "klíče jsou nastavené" : "klíče se přidávají níže ve Správě, každá instance má vlastní" },
    { label: "Školní e-mail Microsoft 365", ok: microsoftConfigured(), hint: microsoftConfigured() ? "zapnuto" : "MS_CLIENT_ID a MS_CLIENT_SECRET v .env (aplikace v Microsoft Entra)" },
    { label: "Todoist přes OAuth", ok: todoistOAuthConfigured(), hint: todoistOAuthConfigured() ? "zapnuto" : "TODOIST_CLIENT_ID a TODOIST_CLIENT_SECRET v .env; bez něj jde jen API token" },
    { label: "Oznámení v mobilní aplikaci (FCM)", ok: fcmEnabled(), hint: fcmEnabled() ? "zapnuto" : "FCM_SERVICE_ACCOUNT v .env nebo data/.fcm.json; oznámení v prohlížeči (Web Push) to neovlivní" },
    { label: "Veřejné demo (Vyzkoušet demo)", ok: demoPublicEnabled(), hint: demoPublicEnabled() ? `zapnuto, aktivních dem: ${activeDemos()}, každé se smaže za ${demoHours()} h; vypnutí DEMO_PUBLIC=off, limit DEMO_MAX` : "vypnuto (DEMO_PUBLIC=off v .env)" },
    { label: "Zpětná vazba e-mailem", ok: !!operator().email, hint: operator().email || "FEEDBACK_EMAIL nebo CONTACT_EMAIL v .env; bez něj se zprávy ukládají jen ve Správě" },
    { label: "Provozovatel v zásadách ochrany údajů", ok: !!operator().name, hint: operator().name || "OPERATOR_NAME v .env (kdo je správcem osobních údajů)" },
  ];
}

