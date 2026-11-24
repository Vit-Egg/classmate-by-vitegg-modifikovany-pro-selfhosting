import { calendarEvents } from "@/lib/calendar";
import { feedUser } from "@/lib/calendar-feed";
import { get, rateLimit } from "@/lib/db";
import { addDays, pragueNow } from "@/lib/dates";
import { toIcs } from "@/lib/ics";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Veřejný (tajným odkazem chráněný) odběr kalendáře pro Google, Apple a Outlook. Bez přihlášení, jen čtení. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  const ip = await clientIp();
  // Omezují se jen neplatné pokusy (Google i Apple se ptají ze sdílených adres).
  const fails = get<{ count: number; reset_at: number }>("SELECT count, reset_at FROM rate_limits WHERE key = ?", `feedfail:${ip}`);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(clean) || (fails && fails.reset_at > Date.now() && fails.count >= 60)) return new Response("Not found", { status: 404 });
  const found = feedUser(clean);
  if (!found) {
    rateLimit(`feedfail:${ip}`, 60, 3600);
    return new Response("Not found", { status: 404 });
  }
  const today = pragueNow().date;
  const { events } = await calendarEvents(found.user, addDays(today, -30), addDays(today, 180), new Set(found.kinds));
  return new Response(toIcs(events, "Classmate"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
