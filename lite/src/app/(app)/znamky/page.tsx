import { marks } from "@/lib/bk";
import { dayShort, dowOf, fmtShort } from "@/lib/dates";
import type { Mark } from "@/lib/types";
import { hueFor } from "@/lib/widgets";
import { Flash, Head, SyncButton, type SP } from "../ui";

export const metadata = { title: "Známky" };

const gradeClass = (m: Mark) => (m.value == null ? "" : ` g${Math.min(5, Math.max(1, Math.round(m.value + 0.01)))}`);
const tempGrade = (t: string) => {
  const n = Number(t.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? ` g${Math.round(n)}` : "";
};
const when = (iso: string) => (iso ? `${dayShort(dowOf(iso))} ${fmtShort(iso)}` : "");

function MarkRow({ m, chip }: { m: Mark; chip?: string }) {
  return (
    <div className="mark-row">
      <div className={`mark${gradeClass(m)}`}>{m.text || "–"}{m.isNew && <i className="new-dot" title="Nová známka" />}</div>
      <div>
        <div className="t">{m.caption || m.theme}</div>
        <div className="m">
          {chip && <span className="chip" style={{ ["--hue" as string]: `var(--h-${chip})` }}>{m.subject}</span>}
          <span>{when(m.date)}</span>
          <span>váha {m.weight}</span>
        </div>
      </div>
    </div>
  );
}

export default async function MarksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const data = await marks();
  const subjects = (data?.subjects ?? []).filter((s) => s.marks.length || s.temporary);
  const latest = subjects.flatMap((s) => s.marks).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);
  return (
    <div className="wide">
      <Head title="Známky" sub="Tvoje známky a průměry">
        <SyncButton back="/znamky" />
      </Head>
      <Flash sp={sp} />
      {!data ? (
        <div className="empty">Známky zatím nejsou načtené.</div>
      ) : !subjects.length ? (
        <div className="empty">Zatím žádné známky.</div>
      ) : (
        <div className="stack-lg">
          <section>
            <h2 className="section" style={{ marginBottom: 12, padding: "0 4px" }}>Poslední známky</h2>
            <div className="card rows">{latest.map((m) => <MarkRow key={m.id} m={m} chip={hueFor(m.subject)} />)}</div>
          </section>
          <h2 className="group-title" style={{ margin: 0 }}>Podle předmětů</h2>
          <div className="auto-cols">
            {subjects.map((s) => {
              const sorted = [...s.marks].sort((a, b) => b.date.localeCompare(a.date));
              return (
                <section key={s.id} style={{ ["--hue" as string]: `var(--h-${hueFor(s.name)})` }}>
                  <div className="subject-head">
                    <h3>
                      <span className="dot" />
                      {s.name}
                      {s.temporary && (
                        <span className="temp-mark" title={s.temporaryNote ? `Předběžná známka: ${s.temporaryNote}` : "Předběžná (čtvrtletní) známka"}>
                          <span className={`mark${tempGrade(s.temporary)}`}>{s.temporary}</span>
                          <small>{s.temporaryNote || "čtvrtletí"}</small>
                        </span>
                      )}
                    </h3>
                    {s.averageText && <span className="avg">průměr<b>{s.averageText}</b></span>}
                  </div>
                  <div className="card rows">
                    {sorted.slice(0, 3).map((m) => <MarkRow key={m.id} m={m} />)}
                    {sorted.length > 3 && (
                      <details className="more-rows">
                        <summary>Další známky ({sorted.length - 3})</summary>
                        {sorted.slice(3).map((m) => <MarkRow key={m.id} m={m} />)}
                      </details>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
