/**
 * Společná úprava poznámky v reálném čase.
 * Text poznámky se u poznámek se spolupracovníky drží jako sdílený dokument (Yjs). Prohlížeče se připojují přes SSE (server → klient)
 * a posílají změny běžným POST (klient → server), takže to funguje i za proxy bez WebSocketu. Server je jediný, kdo drží „místnost“
 * poznámky v paměti, zapisuje změny do databáze (stav dokumentu i JSON poznámky, aby fungovalo čtení, hledání, historie a MCP)
 * a rozesílá je ostatním. Oprávnění se ověřují v cestách (routes), tenhle soubor řeší jen místnosti.
 */
import crypto from "node:crypto";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { get, run, tx } from "./db";
import { docToText } from "./markdown";
import { noteSchema } from "./note-schema";
import { cleanDoc, pruneImages } from "./images";
import { snapshot } from "./note-safety";

const FIELD = "default";
const MAX_CONTENT = 2_000_000;
const MAX_TEXT = 300_000;
export const MAX_UPDATE = 2_000_000;
const SAVE_AFTER_MS = 1500;
const SAVE_MAX_MS = 10_000;
const EVICT_AFTER_MS = 60_000;
export const MAX_STREAMS_PER_USER = 12;

export type Conn = { id: string; userId: number; send: (event: string, data: unknown) => void; close: () => void; awarenessIds: Set<number> };
type Room = {
  noteId: number;
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<string, Conn>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  dirtySince: number | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
  epoch: string;
};

const g = globalThis as unknown as { __collabRooms?: Map<number, Room>; __collabExit?: boolean };
const rooms = (g.__collabRooms ??= new Map<number, Room>());

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
export const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

export class CollabError extends Error {}

/** Sestaví dokument z uložené poznámky, nebo z uloženého stavu, pokud ještě odpovídá poznámce. */
function loadDoc(noteId: number): { doc: Y.Doc; epoch: string } {
  const note = get<{ content: string; rev: number }>("SELECT content, rev FROM notes WHERE id = ? AND deleted_at IS NULL", noteId);
  if (!note) throw new CollabError("Poznámka neexistuje.");
  const saved = get<{ state: Buffer; rev: number }>("SELECT state, rev FROM note_ydocs WHERE note_id = ?", noteId);
  const doc = new Y.Doc();
  if (saved && saved.rev === note.rev) {
    Y.applyUpdate(doc, new Uint8Array(saved.state));
  } else {
    if (note.content) {
      let json: unknown;
      try {
        json = JSON.parse(note.content);
      } catch {
        throw new CollabError("Obsah poznámky je poškozený, společná úprava je vypnutá.");
      }
      prosemirrorJSONToYXmlFragment(noteSchema(), json as never, doc.getXmlFragment(FIELD));
    }
    doc.getMap("meta").set("epoch", crypto.randomBytes(8).toString("hex"));
    run("INSERT INTO note_ydocs (note_id, state, rev) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET state = excluded.state, rev = excluded.rev", noteId, Buffer.from(Y.encodeStateAsUpdate(doc)), note.rev);
  }
  if (!doc.getMap("meta").get("epoch")) doc.getMap("meta").set("epoch", crypto.randomBytes(8).toString("hex"));
  return { doc, epoch: String(doc.getMap("meta").get("epoch")) };
}

function broadcast(room: Room, event: string, data: unknown, except?: string) {
  for (const c of room.conns.values()) if (c.id !== except) c.send(event, data);
}

/** Zapíše dokument do databáze (stav i JSON poznámky). */
function persist(room: Room) {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = null;
  if (room.dirtySince === null) return;
  room.dirtySince = null;
  const json = yXmlFragmentToProsemirrorJSON(room.doc.getXmlFragment(FIELD));
  let content = JSON.stringify(json);
  const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
  try {
    tx(() => {
      const cur = get<{ rev: number }>("SELECT rev FROM notes WHERE id = ? AND deleted_at IS NULL", room.noteId);
      if (!cur) return;
      if (content.length > MAX_CONTENT) {
        console.error(`[spolupráce] poznámka ${room.noteId} je moc dlouhá, do databáze se nezapsala`);
        return;
      }
      content = cleanDoc(content);
      snapshot(room.noteId, "auto", { newSize: content.length });
      const rev = cur.rev + 1;
      run("UPDATE notes SET content = ?, text = ?, rev = ?, updated_at = ? WHERE id = ?", content, docToText(json).slice(0, MAX_TEXT), rev, Date.now(), room.noteId);
      run("INSERT INTO note_ydocs (note_id, state, rev) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET state = excluded.state, rev = excluded.rev", room.noteId, state, rev);
    });
    pruneImages(room.noteId, content);
  } catch (e) {
    console.error("[spolupráce] uložení se nepovedlo", e);
    room.dirtySince = Date.now(); // zkusí se znovu při další změně nebo při odpojení
  }
}

function scheduleSave(room: Room) {
  const now = Date.now();
  room.dirtySince ??= now;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => persist(room), Math.min(SAVE_AFTER_MS, Math.max(0, room.dirtySince + SAVE_MAX_MS - now)));
}

function destroyRoom(room: Room) {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  if (room.evictTimer) clearTimeout(room.evictTimer);
  room.awareness.destroy();
  room.doc.destroy();
  rooms.delete(room.noteId);
}

function room(noteId: number): Room {
  const have = rooms.get(noteId);
  if (have) {
    if (have.evictTimer) clearTimeout(have.evictTimer);
    have.evictTimer = null;
    return have;
  }
  const { doc, epoch } = loadDoc(noteId);
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const r: Room = { noteId, doc, awareness, conns: new Map(), saveTimer: null, dirtySince: null, evictTimer: null, epoch };
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    broadcast(r, "update", b64(update), typeof origin === "string" ? origin : undefined);
    scheduleSave(r);
  });
  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changed = [...added, ...updated, ...removed];
    const from = typeof origin === "string" ? origin : undefined;
    const owner = from ? r.conns.get(from) : undefined;
    if (owner) added.forEach((id) => owner.awarenessIds.add(id)); // aby se kurzor po odpojení smazal
    broadcast(r, "awareness", b64(encodeAwarenessUpdate(awareness, changed)), from);
  });
  rooms.set(noteId, r);
  if (!g.__collabExit) {
    g.__collabExit = true;
    // při vypnutí serveru se rozepsané změny zapíšou (zápis do SQLite je synchronní, takže stihne i při exit)
    process.on("exit", () => rooms.forEach((x) => persist(x)));
  }
  return r;
}

export const totalStreams = () => [...rooms.values()].reduce((n, r) => n + r.conns.size, 0);
export const totalRooms = () => rooms.size;
export const streamsOf = (userId: number) => [...rooms.values()].reduce((n, r) => n + [...r.conns.values()].filter((c) => c.userId === userId).length, 0);

/** Připojí prohlížeč k poznámce a pošle mu celý dokument. */
export function connect(noteId: number, conn: Conn) {
  const r = room(noteId);
  r.conns.set(conn.id, conn);
  conn.send("init", {
    state: b64(Y.encodeStateAsUpdate(r.doc)),
    sv: b64(Y.encodeStateVector(r.doc)),
    epoch: r.epoch,
    awareness: b64(encodeAwarenessUpdate(r.awareness, [...r.awareness.getStates().keys()])),
  });
  return r;
}

export function disconnect(noteId: number, connId: string) {
  const r = rooms.get(noteId);
  const c = r?.conns.get(connId);
  if (!r || !c) return;
  r.conns.delete(connId);
  removeAwarenessStates(r.awareness, [...c.awarenessIds], null);
  if (r.conns.size === 0) {
    persist(r);
    r.evictTimer = setTimeout(() => !r.conns.size && destroyRoom(r), EVICT_AFTER_MS);
  }
}

/** Změna dokumentu od prohlížeče. Vrací false, když spojení neznáme (stream ještě není otevřený nebo skončil). */
export function applyClientUpdate(noteId: number, connId: string, kind: "update" | "awareness", bytes: Uint8Array): boolean {
  const r = rooms.get(noteId);
  if (!r || !r.conns.has(connId)) return false;
  if (kind === "update") Y.applyUpdate(r.doc, bytes, connId);
  else applyAwarenessUpdate(r.awareness, bytes, connId);
  return true;
}

/** Rozešle zprávu všem, kdo mají poznámku otevřenou (např. změnil se název nebo tabule). */
export function collabEmit(noteId: number, event: string, data: unknown) {
  const r = rooms.get(noteId);
  if (r) broadcast(r, event, data);
}

/** Odpojí uživatele (např. přestal být spolupracovníkem). */
export function collabKick(noteId: number, userId: number) {
  const r = rooms.get(noteId);
  if (!r) return;
  for (const c of [...r.conns.values()]) {
    if (c.userId !== userId) continue;
    c.send("kicked", {});
    c.close();
    disconnect(noteId, c.id);
  }
}

/** Poznámka se změnila mimo editor (MCP, obnovení verze): nový obsah se vloží do živého dokumentu, takže otevřená okna se jen přepíší, bez načítání znovu. Bez otevřené místnosti se uložený stav zahodí a sestaví se znovu. */
export function collabReplace(noteId: number, content: string) {
  const r = rooms.get(noteId);
  if (!r) {
    run("DELETE FROM note_ydocs WHERE note_id = ?", noteId);
    return;
  }
  let json: unknown = { type: "doc", content: [] };
  try {
    if (content) json = JSON.parse(content);
  } catch {
    collabClose(noteId, true);
    return;
  }
  r.doc.transact(() => {
    const frag = r.doc.getXmlFragment(FIELD);
    frag.delete(0, frag.length);
    prosemirrorJSONToYXmlFragment(noteSchema(), json as never, frag);
  }, "server");
}

/** Zapíše rozepsané změny a místnost zavře. Při `reset` se prohlížeče vyzvou k načtení znovu (poznámka se změnila mimo společnou úpravu) a uložený stav se zahodí. */
export function collabClose(noteId: number, reset: boolean) {
  const r = rooms.get(noteId);
  if (r) {
    if (reset) r.dirtySince = null;
    else persist(r);
    broadcast(r, reset ? "reset" : "closed", {});
    destroyRoom(r);
  }
  if (reset) run("DELETE FROM note_ydocs WHERE note_id = ?", noteId);
}

/** Zapíše rozepsanou poznámku (před čtením z databáze, např. u MCP nebo stažení). */
export function collabFlush(noteId: number) {
  const r = rooms.get(noteId);
  if (r) persist(r);
}

export const collabActive = (noteId: number) => rooms.has(noteId);
