import { marks } from "@/lib/bk";
import { Flash, SyncButton, type SP } from "../ui";

export const metadata = { title: "Známky" };

const d = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export default async function MarksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const data = await marks();
  const subjects = (data?.subjects ?? []).filter((s) => s.marks.length || s.temporary);
  return (
    <>
      <div className="head">
        <div>
          <h1>Známky</h1>
          <p className="sub">Průměry počítají Bakaláři, nové známky jsou orámované</p>
        </div>
        <SyncButton back="/znamky" />
      </div>
      <Flash sp={sp} />
      {!data ? (
        <div className="card">Známky zatím nejsou načtené.</div>
      ) : !subjects.length ? (
        <div className="card">Zatím žádné známky.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Předmět</th>
                <th style={{ width: 90 }}>Průměr</th>
                <th>Známky</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    {s.temporary && <div className="hint">Předběžná: {s.temporary}{s.temporaryNote ? ` · ${s.temporaryNote}` : ""}</div>}
                  </td>
                  <td className={Number(s.averageText.replace(",", ".")) >= 3.5 ? "bad" : undefined} style={{ fontSize: 18, fontWeight: 700 }}>{s.averageText || "–"}</td>
                  <td>
                    {[...s.marks].sort((a, b) => b.date.localeCompare(a.date)).map((m) => (
                      <span key={m.id} className={`mark${m.isNew ? " new" : ""}`} title={[m.caption, m.theme, `váha ${m.weight}`, d(m.date)].filter(Boolean).join(" · ")}>
                        <b>{m.text || (m.value ?? "")}</b>
                        <small>{d(m.date)}{m.weight && m.weight !== 1 ? ` · ${m.weight}×` : ""}</small>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
