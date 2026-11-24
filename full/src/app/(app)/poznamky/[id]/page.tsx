import Link from "next/link";
import { ReportButton } from "@/components/ReportButton";
import { notFound } from "next/navigation";
import { toggleShare } from "@/app/actions/notes";
import { NoteAudio } from "@/components/NoteAudio";
import { NoteFiles } from "@/components/NoteFiles";
import { ACCEPT, listFiles } from "@/lib/note-files";
import { listAudio } from "@/lib/audio";
import { NoteEditor } from "@/components/NoteEditor";
import { LiveRefresh } from "@/components/LiveRefresh";
import { NoteCollab } from "@/components/NoteCollab";
import { NoteMenu } from "@/components/NoteMenu";
import { NoteViewer } from "@/components/NoteViewer";
import { NoteRating } from "@/components/NoteRating";
import { NoteReviews } from "@/components/NoteReviews";
import { getNoteVotes } from "@/lib/note-votes";
import { getReflection } from "@/lib/reflection";
import { fmtDateTime } from "@/lib/dates";
import { getPref } from "@/lib/prefs";
import { isNoteShared, readableNote } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { userSubjects } from "@/lib/sync";

export const metadata = { title: "Poznámka" };
export const dynamic = "force-dynamic";

const files = (note: { id: number; owner_id: number }, userId: number, canAdd: boolean) => (
  <NoteFiles noteId={note.id} initial={listFiles(note.id)} canAdd={canAdd} meId={userId} ownerId={note.owner_id} accept={ACCEPT} />
);

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const note = readableNote(user, Number((await params).id), true);
  if (!note) notFound();

  if (note.role === "editor") {
    return (
      <div className="note-page">
        <div className="note-top">
          <Link href="/poznamky" className="link-all">← Poznámky</Link>
          <div className="btn-row">
            <span className="chip plain">Vlastní {note.author}</span>
            <NoteCollab id={note.id} count={note.collab_count} owner={false} />
            <a className="btn small" href={`/poznamky/${note.id}/stahnout`} download>Stáhnout (.md)</a>
          </div>
        </div>
        <NoteEditor
          id={note.id} initialTitle={note.title} initialSubject={note.subject_id} initialContent={note.content} updatedAt={note.updated_at}
          subjects={note.subject_id && note.subject ? [{ id: note.subject_id, name: note.subject }] : []}
          initialMode={getPref(user, "note_mode") === "r" ? "r" : "e"} initialBoard={note.board} initialRev={note.rev} initialBoardRev={note.board_rev}
          collab={{ userId: user.id, name: user.name, owner: false }}
          rating={<NoteReviews noteId={note.id} initial={getNoteVotes(note.id, user.id)} canVote />}
          audio={<><NoteAudio noteId={note.id} initial={listAudio(note.id)} readOnly />{files(note, user.id, true)}</>}
        />
      </div>
    );
  }

  if (note.owner_id !== user.id) {
    return (
      <div className="note-page">
        <div className="note-top">
          <Link href="/poznamky" className="link-all">← Poznámky</Link>
          <div className="btn-row">
            <span className="chip plain">Sdílí {note.author}</span>
            <a className="btn small" href={`/poznamky/${note.id}/stahnout`} download>Stáhnout (.md)</a>
          </div>
        </div>
        <h1 className="note-title static">{note.title || "Bez názvu"}</h1>
        <div className="note-meta">
          {note.subject && <span className="chip">{note.subject}</span>}
          <span className="save-state">Upraveno {fmtDateTime(note.updated_at)}</span>
          <ReportButton what={`poznámka „${note.title || "Bez názvu"}“ (/poznamky/${note.id})`} />
        </div>
        <NoteReviews noteId={note.id} initial={getNoteVotes(note.id, user.id)} canVote />
        <LiveRefresh id={note.id} />
        <NoteViewer content={note.content} board={note.board} />
        <NoteAudio noteId={note.id} initial={listAudio(note.id)} readOnly />
        {files(note, user.id, false)}
      </div>
    );
  }

  const subjects = userSubjects(user.id).map((s) => ({ id: s.id, name: s.name }));
  const shared = isNoteShared(note, user);
  const votes = getNoteVotes(note.id, user.id);
  return (
    <div className="note-page">
      <div className="note-top">
        <Link href="/poznamky" className="link-all">← Poznámky</Link>
        <div className="btn-row">
          <form action={toggleShare}>
            <input type="hidden" name="id" value={note.id} />
            <button className={`btn small${shared ? " primary" : ""}`} title={shared ? "Spolužáci ji teď vidí, kliknutím ji přestaneš sdílet." : "Zpřístupní poznámku spolužákům ze třídy"}>
              {shared ? "Nesdílet tuto poznámku" : "Sdílet se třídou"}
            </button>
          </form>
          <NoteCollab id={note.id} count={note.collab_count} owner />
          <NoteMenu id={note.id} pinned={!!note.pinned} shared={shared} />
        </div>
      </div>
      <NoteEditor id={note.id} initialTitle={note.title} initialSubject={note.subject_id} initialContent={note.content} updatedAt={note.updated_at} subjects={subjects} initialMode={note.content && getPref(user, "note_mode") === "r" ? "r" : "e"} initialBoard={note.board} initialRev={note.rev} initialBoardRev={note.board_rev} initialTab={note.board && (!note.content || note.content.length < 40) ? "b" : "t"} collab={{ userId: user.id, name: user.name, owner: true }} rating={<NoteRating noteId={note.id} initial={getReflection(user.id, note.id)} shown={getPref(user, "note_rating") !== "0"} />} audio={<><NoteAudio noteId={note.id} title={note.title} initial={listAudio(note.id)} fresh={Date.now() - note.created_at < 15 * 60_000} />{files(note, user.id, true)}</>} />
      {votes.count > 0 && <NoteReviews noteId={note.id} initial={votes} canVote={false} />}
    </div>
  );
}
