import Link from "next/link";
import { SyncNotice } from "@/components/SyncNotice";
import { fmtShort, pragueNow, relativeDay } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { subjectsOverview } from "@/lib/subjects";

export const metadata = { title: "Předměty" };
export const dynamic = "force-dynamic";

const cs = (n: number) => n.toFixed(2).replace(".", ",");
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

export default async function SubjectsPage() {
  const user = await requireUser();
  const { items, stale } = await subjectsOverview(user);
  const today = pragueNow().date;

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Předměty</h1>
          <p className="subtitle">Všechno k jednotlivým předmětům na jednom místě</p>
        </div>
      </div>
      {stale && <SyncNotice result={{ data: null, stale: true, error: "network" }} />}
      {items.length ? (
        <div className="subj-grid">
          {items.map(({ subject: s, teachers, hoursPerWeek, average, nextTest, openTasks, notes }) => (
            <Link key={s.id} href={`/predmety/${s.id}`} className="subj-card" style={{ ["--hue" as string]: `var(--h-${s.hue})` }}>
              <div className="subj-top">
                <span className="dot" />
                <h2>{s.name}</h2>
                {average != null && <span className="subj-avg" title="Vážený průměr známek">{cs(average)}</span>}
              </div>
              <p className="subj-sub">{[teachers.join(", "), hoursPerWeek ? `${hoursPerWeek} ${plural(hoursPerWeek, "hodina", "hodiny", "hodin")} týdně` : ""].filter(Boolean).join(" · ") || "Zatím bez rozvrhu"}</p>
              <div className="subj-facts">
                {nextTest && <span className="chip danger" title={nextTest.topic || undefined}>{nextTest.oral ? "Zkoušení" : "Test"} {fmtShort(nextTest.date)} · {relativeDay(nextTest.date, today)}</span>}
                {openTasks > 0 && <span className="chip">{openTasks} {plural(openTasks, "úkol", "úkoly", "úkolů")}</span>}
                {notes > 0 && <span className="chip plain">{notes} {plural(notes, "poznámka", "poznámky", "poznámek")}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">Zatím tu nejsou žádné předměty. Objeví se po načtení rozvrhu z Bakalářů.</div>
      )}
    </div>
  );
}
