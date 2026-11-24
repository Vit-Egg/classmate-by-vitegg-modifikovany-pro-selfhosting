/**
 * Nahrávání zvuku k poznámkám, nezávislé na stránce: stav žije v modulu (přežije přechod mezi stránkami aplikace), vyvolá ho jen NoteAudio
 * a ovládá ho plovoucí panel RecorderBar v rozložení aplikace. Jen v prohlížeči.
 *
 * Aby se nahrávka neztratila: kousky zvuku se každých 5 s ukládají do IndexedDB; po pádu, zavření okna nebo vybité baterii se při dalším otevření
 * nabídne uložení toho, co se stihlo. Nepovedené odeslání (výpadek připojení) nahrávku nesmaže, zůstane v zařízení a jde ji odeslat znovu.
 * Při přerušení mikrofonu (odpojení, hovor, odebrané oprávnění) se uloží to, co je hotové. Displej se při nahrávání nevypíná.
 */
import { useSyncExternalStore } from "react";

export type Pending = { id: string; noteId: number; title: string; seconds: number; startedAt: number; bytes: number; /** je to dokončená nahrávka, jen se neodeslala */ ready: boolean };
export type RecState = { status: "idle" | "recording" | "paused" | "saving"; noteId: number | null; title: string; secs: number; error: string; pending: Pending[] };

const IDLE: RecState = { status: "idle", noteId: null, title: "", secs: 0, error: "", pending: [] };
let state: RecState = IDLE;
const subs = new Set<() => void>();
const set = (p: Partial<RecState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const getRecState = () => state;
export const subscribeRec = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useRecorder = () => useSyncExternalStore(subscribeRec, getRecState, () => IDLE);

const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const stamp = () => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

/* ---------- IndexedDB (když není k dispozici, nahrávání funguje, jen bez záchrany po pádu) ---------- */

type Meta = { id: string; noteId: number; title: string; mime: string; startedAt: number; seconds: number; heartbeat: number; ready: boolean };
let dbp: Promise<IDBDatabase> | null = null;
const db = () =>
  (dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const open = indexedDB.open("classmate-rec", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("sessions", { keyPath: "id" });
      open.result.createObjectStore("chunks", { keyPath: ["sid", "i"] });
    };
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  }));
const tx = async <T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
  try {
    const t = (await db()).transaction(stores, mode);
    const r = fn(t);
    return await new Promise<T | undefined>((res, rej) => {
      t.oncomplete = () => res(r ? r.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    });
  } catch {
    return undefined;
  }
};
const putMeta = (m: Meta) => tx(["sessions"], "readwrite", (t) => void t.objectStore("sessions").put(m));
const putChunk = (sid: string, i: number, blob: Blob) => tx(["chunks"], "readwrite", (t) => void t.objectStore("chunks").put({ sid, i, blob }));
const allMeta = async () => ((await tx<Meta[]>(["sessions"], "readonly", (t) => t.objectStore("sessions").getAll())) ?? []) as Meta[];
const chunksOf = async (sid: string) => {
  const rows = ((await tx<{ i: number; blob: Blob }[]>(["chunks"], "readonly", (t) => t.objectStore("chunks").getAll(IDBKeyRange.bound([sid, 0], [sid, Infinity])))) ?? []) as { i: number; blob: Blob }[];
  return rows.sort((a, b) => a.i - b.i).map((r) => r.blob);
};
const dropSession = (sid: string) =>
  tx(["sessions", "chunks"], "readwrite", (t) => {
    t.objectStore("sessions").delete(sid);
    t.objectStore("chunks").delete(IDBKeyRange.bound([sid, 0], [sid, Infinity]));
  });

/* ---------- nahrávání ---------- */

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lock: { release: () => Promise<void> } | null = null;
let chunks: Blob[] = [];
let meta: Meta | null = null;
let seq = 0;
let elapsed = 0;
let discarding = false;

type WakeNav = { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
const keepAwake = async () => {
  try {
    if (!lock && document.visibilityState === "visible") lock = (await (navigator as unknown as WakeNav).wakeLock?.request("screen")) ?? null;
  } catch {}
};
// zámek displeje se po přepnutí na jinou záložku sám uvolní, po návratu se vezme znovu
const onVisible = () => state.status === "recording" && void keepAwake();

function release() {
  if (timer) clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => (t.onended = null, t.stop()));
  stream = null;
  void lock?.release().catch(() => {});
  lock = null;
  document.removeEventListener("visibilitychange", onVisible);
}

export async function startRecording(noteId: number, title: string) {
  if (state.status !== "idle") return;
  set({ error: "" });
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    stream = s;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 });
    recorder = r;
    chunks = [];
    seq = 0;
    elapsed = 0;
    discarding = false;
    meta = { id: crypto.randomUUID(), noteId, title, mime: r.mimeType || mime || "audio/webm", startedAt: Date.now(), seconds: 0, heartbeat: Date.now(), ready: false };
    void putMeta(meta);
    r.ondataavailable = (e) => {
      if (!e.data.size || !meta) return;
      chunks.push(e.data);
      void putChunk(meta.id, seq++, e.data);
      meta = { ...meta, seconds: elapsed, heartbeat: Date.now() };
      void putMeta(meta);
    };
    r.onstop = () => void finish();
    r.onerror = () => {
      set({ error: "Nahrávání se přerušilo, ukládám, co je hotové." });
      stopRecording();
    };
    // odpojený mikrofon, hovor nebo odebrané oprávnění: uloží se to, co už je nahrané
    s.getAudioTracks().forEach((t) => {
      t.onended = () => {
        if (state.status === "recording" || state.status === "paused") {
          set({ error: "Mikrofon se přestal nahrávat, ukládám, co je hotové." });
          stopRecording();
        }
      };
    });
    r.start(5000);
    set({ status: "recording", noteId, title, secs: 0 });
    timer = setInterval(() => {
      if (r.state === "recording") {
        elapsed += 1;
        set({ secs: elapsed });
      }
    }, 1000);
    document.addEventListener("visibilitychange", onVisible);
    void keepAwake();
  } catch (e) {
    release();
    set({ status: "idle", error: (e as DOMException)?.name === "NotAllowedError" ? "Mikrofon je zakázaný. Povol ho v nastavení prohlížeče u téhle stránky." : (e as DOMException)?.name === "NotFoundError" ? "Nenašel jsem žádný mikrofon." : "Nahrávání se nepodařilo spustit." });
  }
}

export function pauseRecording() {
  const r = recorder;
  if (!r) return;
  if (r.state === "recording") (r.pause(), set({ status: "paused" }));
  else if (r.state === "paused") (r.resume(), set({ status: "recording" }));
}

export const stopRecording = () => {
  if (recorder && recorder.state !== "inactive") recorder.stop();
};

export function discardRecording() {
  discarding = true;
  stopRecording();
}

async function finish() {
  const m = meta;
  const seconds = elapsed;
  const blob = new Blob(chunks, { type: m?.mime || "audio/webm" });
  release();
  recorder = null;
  chunks = [];
  meta = null;
  if (!m) return set({ status: "idle", noteId: null, secs: 0 });
  if (discarding || !blob.size) {
    await dropSession(m.id);
    return set({ status: "idle", noteId: null, secs: 0 });
  }
  set({ status: "saving" });
  await putMeta({ ...m, seconds, ready: true });
  const ok = await send(m, blob, seconds);
  set({ status: "idle", noteId: null, secs: 0 });
  if (!ok) await loadPending();
}

/** Odeslání na server. Při úspěchu smaže uloženou kopii a dá vědět stránkám (obnoví se seznam nahrávek). */
function send(m: Pick<Meta, "id" | "noteId">, blob: Blob, seconds: number) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/poznamky/${m.noteId}/audio`);
    xhr.setRequestHeader("X-Name", encodeURIComponent(`Nahrávka ${stamp()}`));
    if (seconds) xhr.setRequestHeader("X-Duration", String(seconds));
    xhr.onload = async () => {
      let body: { error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201) {
        await dropSession(m.id);
        window.dispatchEvent(new CustomEvent("classmate:audio-saved", { detail: { noteId: m.noteId, item: body } }));
        set({ error: "" });
        resolve(true);
      } else {
        set({ error: `${body?.error ?? "Nahrávku se nepodařilo odeslat."} Je uložená v zařízení, můžeš to zkusit znovu.` });
        resolve(false);
      }
    };
    xhr.onerror = () => {
      set({ error: "Nahrávku se nepodařilo odeslat, zkontroluj připojení. Je uložená v zařízení, můžeš to zkusit znovu." });
      resolve(false);
    };
    xhr.send(blob);
  });
}

/* ---------- nedokončené a neodeslané nahrávky ---------- */

/** Najde nahrávky, které zůstaly po pádu nebo neúspěšném odeslání (a nepatří otevřené nahrávce, ani jiné záložce, která právě nahrává). */
export async function loadPending() {
  const out: Pending[] = [];
  for (const m of await allMeta()) {
    if (m.id === meta?.id) continue;
    if (!m.ready && Date.now() - m.heartbeat < 30_000) continue; // nahrává se v jiné záložce
    const bytes = (await chunksOf(m.id)).reduce((a, b) => a + b.size, 0);
    if (!bytes) {
      await dropSession(m.id);
      continue;
    }
    out.push({ id: m.id, noteId: m.noteId, title: m.title, seconds: m.seconds, startedAt: m.startedAt, bytes, ready: m.ready });
  }
  set({ pending: out });
}

export async function savePending(id: string) {
  const m = (await allMeta()).find((x) => x.id === id);
  if (!m) return loadPending();
  set({ status: state.status === "idle" ? "saving" : state.status });
  const ok = await send(m, new Blob(await chunksOf(id), { type: m.mime }), m.seconds);
  if (state.status === "saving") set({ status: "idle" });
  await loadPending();
  return ok;
}

export async function discardPending(id: string) {
  await dropSession(id);
  await loadPending();
}

let started = false;
/** Jednou za běh stránky: nabídne nedokončené nahrávky a po obnovení připojení zkusí odeslat dokončené. */
export function initRecorder() {
  if (started || typeof indexedDB === "undefined") return;
  started = true;
  void loadPending();
  window.addEventListener("online", async () => {
    await loadPending();
    for (const p of state.pending.filter((x) => x.ready)) await savePending(p.id);
  });
}

/* ---------- poznámka, která je právě otevřená k úpravám (pro připomínku nahrávání na začátku hodiny) ---------- */

export type NoteTarget = { noteId: number; title: string } | null;
let target: NoteTarget = null;
const tsubs = new Set<() => void>();
export const setNoteTarget = (t: NoteTarget) => {
  target = t;
  tsubs.forEach((f) => f());
};
export const useNoteTarget = () => useSyncExternalStore((f) => (tsubs.add(f), () => void tsubs.delete(f)), () => target, () => null);

/** Jestli se má na začátku hodiny nabízet nahrávání (nastavení je jen v tomhle prohlížeči). */
const REMIND_KEY = "rec-remind";
const rsubs = new Set<() => void>();
export const remindOn = () => {
  try {
    return localStorage.getItem(REMIND_KEY) !== "0";
  } catch {
    return true;
  }
};
export const setRemind = (on: boolean) => {
  try {
    localStorage.setItem(REMIND_KEY, on ? "1" : "0");
  } catch {}
  rsubs.forEach((f) => f());
};
export const useRemind = () => useSyncExternalStore((f) => (rsubs.add(f), () => void rsubs.delete(f)), remindOn, () => true);
