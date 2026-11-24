/**
 * Žebříček třídy v Trofejích. Navržený tak, aby se s ním nedalo (rozumně) manipulovat a neprozrazoval nic soukromého:
 *
 *  - Body se počítají jen na serveru z odemčených trofejí v tabulce `achievements`. Žádný údaj nepřichází od klienta.
 *  - Počítají se jen trofeje, které nejsou soukromé: ne známky, ne absence (nikdo nepozná, kdo má dobrý prospěch nebo chybí),
 *    ne kuriozity, tajné ani souhrnné.
 *  - Trofeje, které jde „nafarmit“ vlastní činností (spousta poznámek, úkolů, událostí…), mají strop podle stáří účtu:
 *    za každý den existence účtu se jich počítá nejvýš SELF_PER_DAY bodů. Kdo za večer vytvoří sto poznámek, tak žebříčkem
 *    nepoletí, body se mu odkrývají postupně. Běžnému uživateli strop nikdy nevadí.
 *  - Trofeje, které se nedají urychlit (stáří účtu, dny používání, série, služby, zaplacené příspěvky, jednorázová nastavení), se počítají celé.
 *  - Žebříček je zapnutý všem. Kdo nechce, z něj odejde (board_hidden) a pak ho ani nevidí.
 */
import { all, get, run } from "./db";
import { ACHIEVEMENTS, points, type Achievement } from "./achievements-defs";
import { levelOf } from "./achievements";
import type { User } from "./session";

/** Kolik bodů z „vlastní činnosti“ se může započítat za každý den existence účtu. */
export const SELF_PER_DAY = 20;

/** Trofeje, které nejdou urychlit: čas, server nebo jednorázové nastavení. */
const FAIR = /^(age|active|streak|duty|cash|bakalari|totp|mail|push|app$|stats|read25|calfeed|todoist|strava|avatar)/;

const ranked = (a: Achievement) => !a.bad && !a.secret && !a.meta && a.cat !== "marks" && a.cat !== "attendance";
export const RANKED_IDS = new Map(ACHIEVEMENTS.filter(ranked).map((a) => [a.id, a]));
export const isFair = (a: Achievement) => FAIR.test(a.id);

export type BoardRow = { id: number; name: string; score: number; fair: number; self: number; capped: boolean; trophies: number; level: string; rank: number; me: boolean };

export function boardScore(keys: string[], ageDays: number) {
  let fair = 0;
  let self = 0;
  let n = 0;
  for (const k of keys) {
    const a = RANKED_IDS.get(k);
    if (!a) continue;
    n++;
    if (isFair(a)) fair += points(a);
    else self += points(a);
  }
  const allowed = SELF_PER_DAY * (Math.max(0, ageDays) + 1);
  return { score: fair + Math.min(self, allowed), fair, self, capped: self > allowed, trophies: n };
}

export const setBoardOn = (userId: number, on: boolean) => void run("UPDATE users SET board_hidden = ? WHERE id = ?", on ? 0 : 1, userId);
/** Pořadí ve třídě. Lidé, kteří se nezapojili (nebo jsou vyřazení), tu nejsou. Správce vidí i vyřazené (označené). */
export function leaderboard(viewer: User): { joined: boolean; rows: BoardRow[] } {
  const joined = !get<{ h: number }>("SELECT board_hidden h FROM users WHERE id = ?", viewer.id)?.h;
  if (!joined) return { joined, rows: [] };
  const members = all<{ id: number; name: string; created_at: number }>("SELECT id, name, created_at FROM users WHERE class_id = ? AND placeholder = 0 AND demo = 0 AND board_hidden = 0", viewer.class_id);
  if (!members.length) return { joined, rows: [] };
  const ids = members.map((m) => m.id);
  const keys = new Map<number, string[]>();
  for (const r of all<{ user_id: number; key: string }>(`SELECT user_id, key FROM achievements WHERE user_id IN (${ids.map(() => "?").join(",")})`, ...ids)) keys.set(r.user_id, [...(keys.get(r.user_id) ?? []), r.key]);
  const now = Date.now();
  const rows = members
    .map((m) => {
      const s = boardScore(keys.get(m.id) ?? [], Math.floor((now - m.created_at) / 86_400_000));
      return { id: m.id, name: m.name, ...s, level: levelOf(s.score).name, me: m.id === viewer.id, rank: 0 };
    })
    .sort((a, b) => b.score - a.score || b.trophies - a.trophies || a.name.localeCompare(b.name, "cs"));
  // stejné body = stejné pořadí
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
  return { joined, rows };
}
