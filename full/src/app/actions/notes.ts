"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { get, rateLimit } from "@/lib/db";
import { saveNoteVote } from "@/lib/note-votes";
import { listVersions } from "@/lib/note-safety";
import { saveReflection } from "@/lib/reflection";

const readableOwn = (userId: number, id: number) => !!get("SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, userId);
import { docToText, markdownToDoc } from "@/lib/markdown";
import { ConflictError, ServiceError, createNote as svcCreate, inviteCollaborator, removeCollaborator, setNoteTitle, noteCollaborators, invitableClassmates, readableNote, deleteNote as svcDelete, duplicateNote, purgeNote, restoreNote, restoreNoteVersion, saveBoard as svcSaveBoard, saveNoteCopy, setNotePinned, setNoteShared, setShareAllNotes, updateNote } from "@/lib/services";

export async function createNote(fd: FormData) {
  const user = await requireUser();
  const id = svcCreate(user, { subject: Number(fd.get("subject")) || null });
  redirect(`/poznamky/${id}`);
}

/** Automatické ukládání z editoru. `baseRev` je číslo verze, ze které uživatel vychází; když se mezitím změnila jinde, vrací se konflikt a nic se nepřepíše. */
export async function saveNote(
  id: number,
  input: { title: string; subject: number | null; content: string; text: string },
  baseRev?: number,
): Promise<{ ok: true; updatedAt: number; rev: number } | { ok: false; error: string; conflict?: boolean }> {
  const user = await requireUser();
  try {
    return { ok: true, ...updateNote(user, id, input, baseRev) };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Ukládání tabule (samostatně od textu, ať se navzájem nepřepisují). */
export async function saveBoard(id: number, board: string, baseRev?: number): Promise<{ ok: true; updatedAt: number; boardRev: number } | { ok: false; error: string; conflict?: boolean }> {
  const user = await requireUser();
  try {
    return { ok: true, ...svcSaveBoard(user, id, board, baseRev) };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Při konfliktu: uloží moji verzi jako novou poznámku a vrátí její číslo. */
export async function saveMyVersionAsCopy(id: number, input: { title: string; content: string; text: string; board: string }): Promise<{ ok: true; newId: number } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    return { ok: true, newId: saveNoteCopy(user, id, input) };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function getVersions(id: number) {
  const user = await requireUser();
  if (!readableOwn(user.id, id)) return [];
  return listVersions(id);
}

export async function restoreVersion(id: number, versionId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    restoreNoteVersion(user, id, versionId);
    revalidatePath("/poznamky");
    return { ok: true };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function restoreFromTrash(fd: FormData) {
  const user = await requireUser();
  try {
    restoreNote(user, Number(fd.get("id")));
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
  revalidatePath("/poznamky");
}

export async function purgeFromTrash(fd: FormData) {
  const user = await requireUser();
  try {
    purgeNote(user, Number(fd.get("id")));
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
  revalidatePath("/poznamky");
}

export async function togglePin(fd: FormData) {
  const user = await requireUser();
  try {
    setNotePinned(user, Number(fd.get("id")));
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
  revalidatePath("/poznamky");
  if (fd.get("back")) redirect("/poznamky");
}

export async function deleteNote(fd: FormData) {
  const user = await requireUser();
  try {
    svcDelete(user, Number(fd.get("id")));
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
  revalidatePath("/poznamky");
  redirect("/poznamky");
}

const quiet = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
};

export async function toggleShare(fd: FormData) {
  const user = await requireUser();
  quiet(() => void setNoteShared(user, Number(fd.get("id"))));
  revalidatePath("/poznamky", "layout");
}

export async function setShareAll(fd: FormData) {
  const user = await requireUser();
  setShareAllNotes(user, fd.get("enabled") === "1");
  revalidatePath("/poznamky", "layout");
}

export async function duplicate(fd: FormData) {
  const user = await requireUser();
  let id: number | null = null;
  quiet(() => (id = duplicateNote(user, Number(fd.get("id")))));
  if (id) redirect(`/poznamky/${id}`);
}

/** Poznámka z toho, co uživatel sdílí do Classmate z jiné aplikace (systémové „Sdílet“). */
export async function createSharedNote(fd: FormData) {
  const user = await requireUser();
  const body = String(fd.get("body") ?? "").slice(0, 100_000);
  const doc = markdownToDoc(body);
  const id = svcCreate(user, { subject: Number(fd.get("subject")) || null, title: String(fd.get("title") ?? "").trim().slice(0, 200) || undefined, content: JSON.stringify(doc), text: docToText(doc) });
  redirect(`/poznamky/${id}`);
}

/** Společná úprava: ukládá se jen název (text se synchronizuje v reálném čase). */
export async function saveNoteTitle(id: number, title: string, subject?: number | null): Promise<{ ok: true; updatedAt: number } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    setNoteTitle(user, id, title, subject);
    return { ok: true, updatedAt: Date.now() };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

export type CollabInfo = { owner: string; ownerId: number; me: number; mine: boolean; collaborators: { id: number; name: string }[]; invitable: { id: number; name: string }[] };

/** Spolupracovníci poznámky a spolužáci, které jde pozvat (jen vlastník vidí, koho pozvat). */
export async function getCollabInfo(id: number): Promise<CollabInfo | null> {
  const user = await requireUser();
  const n = readableNote(user, id);
  if (!n || n.role === "viewer") return null;
  return {
    owner: n.author,
    ownerId: n.owner_id,
    me: user.id,
    mine: n.role === "owner",
    collaborators: noteCollaborators(id).map((c) => ({ id: c.user_id, name: c.name })),
    invitable: n.role === "owner" ? invitableClassmates(user, id) : [],
  };
}

export async function inviteToNote(id: number, classmateId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    inviteCollaborator(user, id, classmateId);
    revalidatePath("/poznamky");
    return { ok: true };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function removeFromNote(id: number, userId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    removeCollaborator(user, id, userId);
    revalidatePath("/poznamky");
    return { ok: true };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Veřejné hodnocení cizí poznámky (hvězdičky a komentář); smí každý, kdo poznámku vidí, kromě autora. */
export async function saveNoteVoteAction(noteId: number, stars: number | null, comment: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const note = readableNote(user, noteId);
  if (!note || note.owner_id === user.id) return { ok: false };
  if (!rateLimit(`vote:${user.id}`, 120, 3600)) return { ok: false };
  saveNoteVote(user.id, noteId, stars, comment);
  return { ok: true };
}

/** Moje hodnocení poznámky (chápání a soustředění); smí každý, kdo poznámku vidí. */
export async function saveNoteRating(noteId: number, r: { understanding: number | null; understanding_note: string; focus: number | null; focus_note: string }): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!readableNote(user, noteId)) return { ok: false };
  saveReflection(user.id, noteId, r);
  return { ok: true };
}
