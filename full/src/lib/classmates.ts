import { all, get } from "./db";
import { baseWeek, dutyEnabled } from "./duty";
import { pragueNow } from "./dates";

export type Role = "admin" | "treasurer" | "duty";
export const ROLE_LABEL: Record<Role, string> = { admin: "Správce", treasurer: "Pokladník", duty: "Má službu" };
/** Pořadí rolí při výpisu. */
export const ROLE_ORDER: Role[] = ["admin", "treasurer", "duty"];
export type Classmate = { id: number; name: string; roles: Role[]; /** neregistrovaný člen od správce (bez účtu) */ placeholder: boolean };

/**
 * Seznam lidí z třídy včetně rolí, které v aplikaci mají. Jen jméno a role, žádné kontakty.
 * Pokladník se ukazuje jen když má třída Pokladnu, služba jen když má třída Třídní služby (a jen aktuální týden).
 */
export function classmates(classId: number): Classmate[] {
  const cash = !!get<{ c: number }>("SELECT cash_enabled c FROM classes WHERE id = ?", classId)?.c;
  const onDuty = new Set<number>(
    dutyEnabled(classId)
      ? all<{ user_id: number }>("SELECT user_id FROM duty_weeks WHERE class_id = ? AND week_start = ?", classId, baseWeek(pragueNow())).map((r) => r.user_id)
      : [],
  );
  return all<{ id: number; name: string; role: string; treasurer: number; placeholder: number }>("SELECT id, name, role, treasurer, placeholder FROM users WHERE class_id = ? ORDER BY cz(name)", classId).map((u) => {
    const roles: Role[] = [];
    if (u.role === "admin") roles.push("admin");
    if (cash && u.treasurer) roles.push("treasurer");
    if (onDuty.has(u.id)) roles.push("duty");
    return { id: u.id, name: u.name, roles, placeholder: !!u.placeholder };
  });
}

/** Spolužáci, kteří mají předmět v téže skupině jako ty (tedy chodí na něj s tebou), seskupení podle skupiny. Bez neregistrovaných členů a bez tebe. */
export function subjectMates(viewer: { id: number; class_id: number }, subjectId: number): { group: string; wholeClass: boolean; people: { id: number; name: string }[] }[] {
  const rows = all<{ gid: number; label: string; whole: number; id: number; name: string }>(
    `SELECT g.id gid, g.label, g.whole_class whole, u.id, u.name
     FROM user_subjects me
     JOIN user_subjects us ON us.group_id = me.group_id AND us.subject_id = me.subject_id AND us.user_id <> me.user_id
     JOIN groups g ON g.id = me.group_id
     JOIN users u ON u.id = us.user_id AND u.class_id = ? AND u.placeholder = 0
     WHERE me.user_id = ? AND me.subject_id = ?
     ORDER BY g.whole_class, g.label COLLATE NOCASE, cz(u.name)`, viewer.class_id, viewer.id, subjectId);
  const out = new Map<number, { group: string; wholeClass: boolean; people: { id: number; name: string }[] }>();
  for (const r of rows) {
    const g = out.get(r.gid) ?? { group: r.label, wholeClass: !!r.whole, people: [] };
    g.people.push({ id: r.id, name: r.name });
    out.set(r.gid, g);
  }
  return [...out.values()];
}
