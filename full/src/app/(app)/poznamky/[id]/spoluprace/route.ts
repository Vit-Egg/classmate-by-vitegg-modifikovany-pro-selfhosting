import crypto from "node:crypto";
import { MAX_STREAMS_PER_USER, MAX_UPDATE, applyClientUpdate, connect, disconnect, fromB64, streamsOf, type Conn } from "@/lib/collab";
import { editableNote, readableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Proud změn poznámky (SSE): po připojení přijde celý dokument, pak změny ostatních. Smí ho každý, kdo poznámku smí číst; měnit ji (POST) jen vlastník a pozvaní. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  const noteId = Number((await params).id);
  const note = readableNote(user, noteId);
  if (!note) return json({ error: "Poznámka neexistuje." }, 404);
  if (streamsOf(user.id) >= MAX_STREAMS_PER_USER) return json({ error: "Moc otevřených oken." }, 429);

  const readOnly = note.role === "viewer"; // čtenář sdílené poznámky jen sleduje změny
  const enc = new TextEncoder();
  const id = crypto.randomBytes(9).toString("base64url");
  let beat: ReturnType<typeof setInterval> | undefined;
  let ctl: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  // `fromClient`: spojení ukončil prohlížeč (stream už je zavřený, znovu ho zavírat nesmíme, jinak Next hlásí „Controller is already closed“)
  const end = (fromClient = false) => {
    if (closed) return;
    closed = true;
    clearInterval(beat);
    disconnect(noteId, id);
    if (fromClient) return;
    try {
      ctl?.close();
    } catch {}
  };
  const write = (chunk: string) => {
    if (closed) return;
    try {
      ctl?.enqueue(enc.encode(chunk));
    } catch {
      end(true);
    }
  };
  const conn: Conn = { id, userId: user.id, awarenessIds: new Set(), send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`), close: () => end() };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
      write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ conn: id })}\n\n`);
      try {
        connect(noteId, conn);
      } catch (e) {
        conn.send("failed", { error: (e as Error).message });
        end();
        return;
      }
      // tep drží spojení otevřené a zároveň hlídá, jestli má uživatel k poznámce pořád přístup
      beat = setInterval(() => {
        const now = readableNote(user, noteId);
        if (!now || (now.role === "viewer") !== readOnly) {
          conn.send("kicked", {});
          end();
          return;
        }
        write(": ping\n\n");
      }, 15_000);
    },
    cancel: () => end(true),
  });
  req.signal.addEventListener("abort", () => end(true));
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}

/** Změna od prohlížeče: `?c=` je číslo spojení z události hello, `?k=update|awareness`, tělo je binární aktualizace dokumentu. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  const noteId = Number((await params).id);
  if (!editableNote(user, noteId)) return json({ error: "Poznámka neexistuje." }, 404);
  const url = new URL(req.url);
  const conn = url.searchParams.get("c") ?? "";
  const kind = url.searchParams.get("k") === "awareness" ? "awareness" : "update";
  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_UPDATE) return json({ error: "Změna je moc velká." }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_UPDATE) return json({ error: "Změna je moc velká." }, 413);
  try {
    if (!applyClientUpdate(noteId, conn, kind, bytes)) return json({ error: "Spojení neexistuje." }, 410);
  } catch {
    return json({ error: "Neplatná změna." }, 400);
  }
  return json({ ok: true });
}
