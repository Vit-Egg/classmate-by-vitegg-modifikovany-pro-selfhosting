import { komensTypes } from "@/lib/komens";
import { mailAccount, mailbox, schoolMail, schoolMicrosoft } from "@/lib/mailbox";
import { getCurrentUser } from "@/lib/session";
import { teamsAccount, teamsChannels, teamsChats, teamsTeams } from "@/lib/teams";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Možnosti pro okno Nová zpráva podle zvoleného kanálu:
 *  komens: typy zpráv se skupinami příjemců, posta: adresy, ze kterých ti nedávno psali, teams: chaty a týmy (s ?team= kanály týmu).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  try {
    switch (url.searchParams.get("k")) {
      case "komens":
        if (!user.bakalari_refresh_enc) return json({ error: "not_connected" }, 409);
        return json({ types: await komensTypes(user) });
      case "posta": {
        const cfg = schoolMail(user.school_id);
        if (!cfg || !mailAccount(user.id, cfg.kind)) return json({ error: "not_connected" }, 409);
        const seen = new Map<string, string>();
        const own = mailAccount(user.id, cfg.kind)!.address.toLowerCase();
        const { items } = await mailbox(user).list("inbox", 60, 0).catch(() => ({ items: [] }));
        for (const m of items) {
          const addr = m.fromAddr.trim().toLowerCase();
          if (addr && addr !== own && !seen.has(addr)) seen.set(addr, m.from || addr);
        }
        return json({ contacts: [...seen].slice(0, 40).map(([addr, name]) => ({ addr, name })) });
      }
      case "teams": {
        if (!schoolMicrosoft(user.school_id) || !teamsAccount(user.id)) return json({ error: "not_connected" }, 409);
        const team = url.searchParams.get("team");
        if (team) return json({ channels: await teamsChannels(user.id, team) });
        const [chats, teams] = await Promise.all([teamsChats(user.id), teamsTeams(user.id)]);
        return json({ chats: chats.map((c) => ({ id: c.id, name: c.name, kind: c.kind })), teams });
      }
    }
  } catch (e) {
    console.error("[komunikace] příjemci:", (e as Error).message);
    return json({ error: "failed" }, 502);
  }
  return json({ error: "bad_request" }, 400);
}
