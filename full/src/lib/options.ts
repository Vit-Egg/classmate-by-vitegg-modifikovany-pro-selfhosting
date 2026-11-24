import { peekTimetable, subjectGroups, userSubjects } from "./sync";
import type { SubjectOption } from "@/components/ItemDialog";
import type { User } from "./session";

export function subjectOptions(user: User, onlyPermanent = false): SubjectOption[] {
  let list = userSubjects(user.id);
  if (onlyPermanent) {
    const tt = peekTimetable(user, "permanent");
    if (tt) {
      const inTimetable = new Set(tt.lessons.map((l) => l.subjectId));
      list = list.filter((s) => inTimetable.has(s.bk_id));
    }
  }
  const tt = peekTimetable(user, "permanent");
  return list.map((s) => ({
    id: s.id,
    name: s.name,
    days: tt ? [...new Set(tt.lessons.filter((l) => l.subjectId === s.bk_id).map((l) => l.day))].sort() : [1, 2, 3, 4, 5],
    groups: subjectGroups(user.id, s.id).map((g) => ({ id: g.id, label: g.label, whole: !!g.whole_class })),
  }));
}
