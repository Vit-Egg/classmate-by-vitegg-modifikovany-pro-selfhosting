"use client";

/**
 * Prohlížečová strana společné úpravy poznámky: sdílený dokument (Yjs), kurzory ostatních a spojení se serverem
 * (SSE pro příchozí změny, POST pro odchozí; viz lib/collab.ts). Po výpadku se spojí samo a dohodne se se serverem, co komu chybí.
 */
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";

export type CollabStatus = "connecting" | "online" | "offline";
export type CollabHooks = {
  onStatus: (s: CollabStatus) => void;
  onSynced: () => void;
  onMeta: (m: { title?: string }) => void;
  onBoard: (b: { rev: number; by: number }) => void;
  /** poznámka se změnila mimo společnou úpravu, nebo je potřeba ji načíst znovu */
  onReset: () => void;
  onKicked: () => void;
  onFailed: (message: string) => void;
};

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class CollabProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private es: EventSource | null = null;
  private conn = "";
  private epoch = "";
  private pending: Uint8Array[] = [];
  private sending = false;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private awTimer: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private dead = false;
  private paused = false;
  private offTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private onNudge = () => this.nudge();
  synced = false;

  constructor(private noteId: number, private hooks: CollabHooks) {
    this.doc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      this.pending.push(u);
      this.persistSoon();
      if (!this.sendTimer) this.sendTimer = setTimeout(() => void this.flush(), 40);
    });
    this.awareness.on("update", (_c: unknown, origin: unknown) => {
      if (origin === "remote" || this.awTimer) return;
      this.awTimer = setTimeout(() => {
        this.awTimer = null;
        void this.post("awareness", encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      }, 120);
    });
    if (typeof window !== "undefined") {
      // po návratu připojení nebo na kartu se nečeká na další pokus, spojí se hned
      window.addEventListener("online", this.onNudge);
      document.addEventListener("visibilitychange", this.onNudge);
    }
    this.connect();
  }

  /** Není spojení? Pak se zkusí hned (po návratu sítě, na kartu, z paměti prohlížeče). */
  private nudge() {
    if (this.dead || this.paused) return;
    if (document.visibilityState === "hidden") return;
    if (this.status !== "online") {
      if (this.retry) {
        clearTimeout(this.retry);
        this.retry = null;
      }
      this.es?.close();
      this.es = null;
      this.conn = "";
      this.connect();
    }
  }

  private status: CollabStatus = "connecting";
  private setStatus(s: CollabStatus) {
    if (s === "offline") {
      // krátké přerušení (proxy zavře spojení, EventSource se hned připojí znovu) se uživateli neukazuje
      if (this.offTimer || this.status === "offline") return;
      this.offTimer = setTimeout(() => {
        this.offTimer = null;
        this.status = "offline";
        this.hooks.onStatus("offline");
      }, typeof navigator !== "undefined" && navigator.onLine === false ? 0 : 4000);
      return;
    }
    if (this.offTimer) {
      clearTimeout(this.offTimer);
      this.offTimer = null;
    }
    this.status = s;
    this.hooks.onStatus(s);
  }

  /** Něco, co server ještě nemá (rozepsané nebo neodeslané). */
  unsent() {
    return this.pending.length > 0 || this.sending;
  }

  /** Pošle hned všechno, co čeká; vrací true, když server vše přijal. */
  async flushNow(): Promise<boolean> {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    if (!this.conn) return !this.pending.length;
    for (let i = 0; i < 40 && this.sending; i++) await new Promise((r) => setTimeout(r, 50));
    await this.flush();
    return !this.unsent();
  }

  /** Stránka jde do paměti prohlížeče (bfcache): spojení zanikne samo, po návratu se obnoví. */
  pause() {
    this.paused = true;
    this.es?.close();
    this.es = null;
    this.conn = "";
  }
  resume() {
    if (this.dead) return;
    this.paused = false;
    this.nudge();
    if (this.status === "online") return;
    if (!this.es) this.connect();
  }

  // Neodeslané změny se průběžně zálohují v prohlížeči; po zavření karty v offline stavu se po dalším spojení doplní.
  private storeKey = () => `collab-unsent:${this.noteId}`;
  private persistSoon() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        if (this.unsent() || this.status !== "online") localStorage.setItem(this.storeKey(), JSON.stringify({ epoch: this.epoch, state: b64(Y.encodeStateAsUpdate(this.doc)), at: Date.now() }));
        else localStorage.removeItem(this.storeKey());
      } catch {}
    }, 400);
  }
  private restoreLocal() {
    try {
      const raw = localStorage.getItem(this.storeKey());
      if (!raw) return;
      const d = JSON.parse(raw) as { epoch: string; state: string };
      if (d.epoch && d.epoch === this.epoch) Y.applyUpdate(this.doc, fromB64(d.state), "remote");
    } catch {}
  }

  private url = (kind: string) => `/poznamky/${this.noteId}/spoluprace?c=${encodeURIComponent(this.conn)}&k=${kind}`;

  private connect() {
    if (this.dead) return;
    this.setStatus("connecting");
    const es = new EventSource(`/poznamky/${this.noteId}/spoluprace`);
    this.es = es;
    es.addEventListener("hello", (e) => {
      this.conn = JSON.parse((e as MessageEvent).data).conn;
    });
    es.addEventListener("init", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as { state: string; sv: string; epoch: string; awareness: string };
      if (this.epoch && this.epoch !== m.epoch) {
        // dokument na serveru se postavil znovu (poznámka se změnila jinde): moje starší kopie by se s ním slila špatně
        this.hooks.onReset();
        return;
      }
      this.epoch = m.epoch;
      Y.applyUpdate(this.doc, fromB64(m.state), "remote");
      if (!this.synced) this.restoreLocal(); // co jsem napsal v minulém spojení a server ještě nemá
      applyAwarenessUpdate(this.awareness, fromB64(m.awareness), "remote");
      // co jsem napsal, když spojení nebylo, server ještě nemá
      const missing = Y.encodeStateAsUpdate(this.doc, fromB64(m.sv));
      this.pending = missing.length > 2 ? [missing] : [];
      void this.flush();
      void this.post("awareness", encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      this.setStatus("online");
      this.persistSoon();
      if (!this.synced) {
        this.synced = true;
        this.hooks.onSynced();
      }
    });
    es.addEventListener("update", (e) => Y.applyUpdate(this.doc, fromB64(JSON.parse((e as MessageEvent).data)), "remote"));
    es.addEventListener("awareness", (e) => applyAwarenessUpdate(this.awareness, fromB64(JSON.parse((e as MessageEvent).data)), "remote"));
    es.addEventListener("meta", (e) => this.hooks.onMeta(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("board", (e) => this.hooks.onBoard(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("reset", () => this.hooks.onReset());
    es.addEventListener("closed", () => this.reconnect(500));
    es.addEventListener("kicked", () => {
      this.destroy();
      this.hooks.onKicked();
    });
    es.addEventListener("failed", (e) => {
      this.destroy();
      this.hooks.onFailed(JSON.parse((e as MessageEvent).data).error);
    });
    es.onerror = () => {
      // EventSource se sám připojí znovu, ale po chybě HTTP (např. odhlášení) by se jen točil dokola
      this.setStatus("offline");
      if (es.readyState === EventSource.CLOSED) this.reconnect(3000);
    };
  }

  private reconnect(ms: number) {
    this.es?.close();
    this.es = null;
    this.conn = "";
    if (this.dead || this.paused || this.retry) return;
    this.setStatus("offline");
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, ms);
  }

  private async flush() {
    this.sendTimer = null;
    if (this.sending || !this.pending.length || !this.conn) return;
    this.sending = true;
    try {
      while (this.pending.length && this.conn) {
        const batch = this.pending;
        this.pending = [];
        const ok = await this.post("update", Y.mergeUpdates(batch));
        if (!ok) {
          // neodešlo se: nic se neztratí, po novém spojení si server vyžádá rozdíl
          this.reconnect(1000);
          return;
        }
      }
      this.persistSoon();
    } finally {
      this.sending = false;
    }
  }

  private async post(kind: "update" | "awareness", body: Uint8Array): Promise<boolean> {
    if (!this.conn) return false;
    try {
      const r = await fetch(this.url(kind), { method: "POST", body: body as BodyInit, headers: { "Content-Type": "application/octet-stream" }, keepalive: body.length < 60_000 });
      if (r.status === 401 || r.status === 404) {
        this.destroy();
        this.hooks.onKicked();
        return true;
      }
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Ukončí spojení a odebere můj kurzor ostatním. */
  destroy() {
    this.dead = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onNudge);
      document.removeEventListener("visibilitychange", this.onNudge);
    }
    if (this.offTimer) clearTimeout(this.offTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.awTimer) clearTimeout(this.awTimer);
    if (this.retry) clearTimeout(this.retry);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.es?.close();
    this.es = null;
    this.awareness.destroy();
  }
}
