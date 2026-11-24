import Link from "next/link";
import { cookies } from "next/headers";
import { createNote, purgeFromTrash, restoreFromTrash, setShareAll } from "@/app/actions/notes";
import { ConfirmButton } from "@/components/forms";
import { LiveSearch } from "@/components/LiveSearch";
import { NoteImport } from "@/components/NoteImport";
import { NoteMenu } from "@/components/NoteMenu";
import { PersistedSeg } from "@/components/PersistedSeg";
import { all } from "@/lib/db";
import { fmtDateTime, fmtShort, pragueNow } from "@/lib/dates";
import { collaborativeNotes, isNoteShared, sharedNotes, type SharedNoteRow } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { userSubjects } from "@/lib/sync";
import { fold, snippet } from "@/lib/text";

export const metadata = { title: "Poznámky" };
export const dynamic = "force-dynamic";

type Row = { understanding: number | null; focus: number | null; id: number; title: string; text: string; pinned: number; shared: number; unshared: number; updated_at: number; subject_id: number | null; subject_name: string | null; hue: string | null };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; g?: string ; k?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = fold((sp.q ?? "").trim());
  const subjectFilter = Number(sp.s) || null;
  const grouping = (sp.g === "s" || sp.g === "n" ? sp.g : (await cookies()).get("notes_group")?.value === "s" ? "s" : "n") as "n" | "s";
  const subjects = userSubjects(user.id);
  const trash = all<{ id: number; title: string; deleted_at: number; size: number }>("SELECT id, title, deleted_at, length(content) + length(board) AS size FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", user.id);
  if (sp.k === "kos") {
    return (
      <div className="wide">
        <div className="page-head">
          <div>
            <h1 className="title">Koš poznámek</h1>
            <p className="subtitle">Smazané poznámky se po 30 dnech smažou natrvalo, do té doby je jde obnovit.</p>
          </div>
          <Link href="/poznamky" className="btn">← Poznámky</Link>
        </div>
        {trash.length ? (
          <div className="card rows">
            {trash.map((n) => (
              <div key={n.id} className="trash-row">
                <div className="item-main">
                  <div className="item-title">{n.title || "Bez názvu"}</div>
                  <div className="item-meta"><span>smazáno {fmtShort(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(n.deleted_at))} · zbývá {Math.max(0, 30 - Math.floor((Date.now() - n.deleted_at) / 86_400_000))} dní</span></div>
                </div>
                <div className="btn-row">
                  <form action={restoreFromTrash}><input type="hidden" name="id" value={n.id} /><button className="btn small primary">Obnovit</button></form>
                  <form action={purgeFromTrash}><input type="hidden" name="id" value={n.id} /><ConfirmButton className="btn small danger" message="Smazat natrvalo? Už to nepůjde vrátit.">Smazat navždy</ConfirmButton></form>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="empty">Koš je prázdný.</div>}
      </div>
    );
  }

  let notes = all<Row>(
    `SELECT n.id, n.title, substr(n.text, 1, 30000) AS text, n.pinned, n.shared, n.unshared, n.updated_at, n.subject_id, s.name AS subject_name, s.hue,
            (SELECT understanding FROM note_reflections r WHERE r.note_id = n.id AND r.user_id = n.user_id) AS understanding,
            (SELECT focus FROM note_reflections r WHERE r.note_id = n.id AND r.user_id = n.user_id) AS focus
     FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
     WHERE n.user_id = ? AND n.deleted_at IS NULL ${subjectFilter ? "AND n.subject_id = ?" : ""}
     ORDER BY n.pinned DESC, n.updated_at DESC`,
    ...(subjectFilter ? [user.id, subjectFilter] : [user.id]),
  );
  const total = notes.length;
  if (q) notes = notes.filter((n) => fold(n.title).includes(q) || fold(n.text).includes(q));

  const collabCounts = new Map(all<{ note_id: number; n: number }>("SELECT c.note_id, COUNT(*) n FROM note_collaborators c JOIN notes x ON x.id = c.note_id WHERE x.user_id = ? GROUP BY c.note_id", user.id).map((r) => [r.note_id, r.n]));
  const together = collaborativeNotes(user).filter((n) => !q || fold(n.title).includes(q) || fold(n.text).includes(q));
  const shared = sharedNotes(user).filter((n) => (!subjectFilter || n.subject_id === subjectFilter) && (!q || fold(n.title).includes(q) || fold(n.text).includes(q)));

  const today = pragueNow().date;
  const dateOf = (ms: number) => {
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ms);
    return iso === today ? fmtDateTime(ms).split(" ").slice(-1)[0] : fmtShort(iso);
  };
  const href = (s: number | null) => `/poznamky?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(s ? { s: String(s) } : {}) })}`;
  const used = subjects.filter((s) => all("SELECT 1 FROM notes WHERE user_id = ? AND subject_id = ? AND deleted_at IS NULL LIMIT 1", user.id, s.id).length);

  const renderRow = (n: Row) => (
    <div key={n.id} className="note-row" style={n.subject_name ? { ["--hue" as string]: `var(--h-${n.hue})` } : undefined}>
      <Link href={`/poznamky/${n.id}`} className="note-link">
        <div className="item-title">{n.title || <span className="muted">Bez názvu</span>}</div>
        <div className="note-snip">{snippet(n.text, q) || <span className="muted">Prázdná poznámka</span>}</div>
        <div className="item-meta">
          {n.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${n.hue})` }}>{n.subject_name}</span>}
          {isNoteShared(n, user) && <span className="chip plain">Sdíleno</span>}
          {collabCounts.has(n.id) && <span className="chip plain">Společná · {collabCounts.get(n.id)! + 1}</span>}
          {n.understanding != null && <span className="rate-chip" title="Moje hodnocení: chápání">{["😵", "😕", "😐", "🙂", "🤩"][n.understanding - 1]}</span>}
          {n.focus != null && <span className="rate-chip" title="Moje hodnocení: soustředění">{["😴", "🥱", "😐", "🙂", "🎯"][n.focus - 1]}</span>}
          <span>{dateOf(n.updated_at)}</span>
        </div>
      </Link>
      <NoteMenu id={n.id} pinned={!!n.pinned} shared={isNoteShared(n, user)} />
    </div>
  );

  const sharedRow = (n: SharedNoteRow, showAuthor: boolean, showSubject: boolean) => (
    <div key={n.id} className="note-row" style={n.subject_name ? { ["--hue" as string]: `var(--h-${n.hue})` } : undefined}>
      <Link href={`/poznamky/${n.id}`} className="note-link">
        <div className="item-title">{n.title || <span className="muted">Bez názvu</span>}</div>
        <div className="note-snip">{snippet(n.text, q) || <span className="muted">Prázdná poznámka</span>}</div>
        <div className="item-meta">
          {showSubject && n.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${n.hue})` }}>{n.subject_name}</span>}
          {showAuthor && <span className="chip plain">{n.author}</span>}
          <span>{dateOf(n.updated_at)}</span>
        </div>
      </Link>
    </div>
  );

  const group = <T,>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return [...m];
  };
  const bySubject = (list: SharedNoteRow[]) => group(list, (n) => n.subject_name ?? "Bez předmětu").sort(([a], [b]) => (a === "Bez předmětu" ? 1 : b === "Bez předmětu" ? -1 : a.localeCompare(b, "cs")));

  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Poznámky</h1>
          <p className="subtitle">Všechno ze školy na jednom místě. Ostatní uvidí jen to, co sdílíš.</p>
        </div>
        <div className="btn-row" style={{ alignItems: "flex-start" }}>
          <NoteImport subject={subjectFilter} />
          <form action={createNote}>
            {subjectFilter && <input type="hidden" name="subject" value={subjectFilter} />}
            <button data-new className="btn primary btn-new">Nová poznámka</button>
          </form>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}><LiveSearch initial={sp.q ?? ""} placeholder="Hledat v poznámkách…" label="Hledat v poznámkách" /></div>
      {used.length > 0 && (
        <nav className="seg wrap" style={{ marginBottom: 18 }} aria-label="Předmět">
          <Link href={href(null)} aria-current={!subjectFilter}>Vše</Link>
          {used.map((s) => (
            <Link key={s.id} href={href(s.id)} aria-current={subjectFilter === s.id}>{s.name}</Link>
          ))}
        </nav>
      )}

      {trash.length > 0 && <p className="hint" style={{ margin: "0 4px 14px" }}><Link href="/poznamky?k=kos" className="link-u">Koš ({trash.length})</Link> · smazané poznámky jde 30 dní obnovit</p>}

      <form action={setShareAll} className="card share-all">
        <input type="hidden" name="enabled" value={user.share_notes ? "0" : "1"} />
        <div>
          <b>Sdílet všechny moje poznámky se třídou</b>
          <small>Platí i pro ty, které teprve napíšeš. Jednotlivé poznámky můžeš sdílet přes „⋯“.</small>
        </div>
        <button className={`switch${user.share_notes ? " on" : ""}`} role="switch" aria-checked={!!user.share_notes} aria-label="Sdílet všechny poznámky"><i /></button>
      </form>

      <div className="stack-lg" style={{ marginTop: 26 }}>
        {notes.length === 0 ? (
          <div className="empty">{total ? "Nic takového jsem nenašel." : "Zatím žádné poznámky. První založíš tlačítkem nahoře."}</div>
        ) : (
          <>
            {pinned.length > 0 && (
              <section>
                <h2 className="group-title">Připnuté</h2>
                <div className="card rows split">{pinned.map(renderRow)}</div>
              </section>
            )}
            {rest.length > 0 && (
              <section>
                {pinned.length > 0 && <h2 className="group-title">Ostatní</h2>}
                <div className="card rows split">{rest.map(renderRow)}</div>
              </section>
            )}
          </>
        )}

        {together.length > 0 && (
          <section className="hr-section">
            <h2 className="section" style={{ marginBottom: 14 }}>Upravuji se spolužáky</h2>
            <div className="card rows split">
              {together.map((n) => (
                <div key={n.id} className="note-row" style={n.subject_name ? { ["--hue" as string]: `var(--h-${n.hue})` } : undefined}>
                  <Link href={`/poznamky/${n.id}`} className="note-link">
                    <div className="item-title">{n.title || <span className="muted">Bez názvu</span>}</div>
                    <div className="note-snip">{snippet(n.text, q) || <span className="muted">Prázdná poznámka</span>}</div>
                    <div className="item-meta">
                      {n.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${n.hue})` }}>{n.subject_name}</span>}
                      <span className="chip plain">Vlastní {n.owner}</span>
                      <span>{dateOf(n.updated_at)}</span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {shared.length > 0 && (
          <section className="hr-section">
            <div className="section-head" style={{ marginBottom: 18 }}>
              <h2 className="section">Sdílené od spolužáků</h2>
              <PersistedSeg param="g" cookie="notes_group" label="Rozdělení" current={grouping} options={[{ value: "n", label: "Podle jmen" }, { value: "s", label: "Podle předmětů" }]} />
            </div>
            {(() => {
              const groups = grouping === "n"
                ? group(shared, (n) => `${n.author_id}|${n.author}`).map(([k, list]) => ({ key: k, title: k.split("|")[1], list, hint: [...new Set(list.map((n) => n.subject_name ?? "Bez předmětu"))].slice(0, 3).join(", ") }))
                : bySubject(shared).map(([subject, list]) => ({ key: subject, title: subject, list, hint: [...new Set(list.map((n) => n.author))].slice(0, 3).join(", ") }));
              // při hledání nebo když je skupina jediná se rovnou rozbalí, jinak je přehled jen seznam jmen (předmětů) s počty
              const openAll = !!q || groups.length === 1;
              return (
                <div className="card rows shared-groups">
                  {groups.map((g) => (
                    <details key={g.key} className="shared-group" open={openAll}>
                      <summary>
                        <span className="sg-title">{g.title}</span>
                        <span className="sg-hint">{g.hint}</span>
                        <span className="sg-count">{g.list.length}</span>
                      </summary>
                      <div className="sg-body">
                        {grouping === "n" ? (
                          bySubject(g.list).map(([subject, items]) => (
                            <div key={subject}>
                              <h4 className="subject-title">{subject}</h4>
                              <div className="card rows split">{items.map((n) => sharedRow(n, false, false))}</div>
                            </div>
                          ))
                        ) : (
                          <div className="card rows split">{g.list.map((n) => sharedRow(n, true, false))}</div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              );
            })()}
          </section>
        )}
      </div>
    </div>
  );
}
