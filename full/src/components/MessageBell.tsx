"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { openMessage, readAll, removeMessages } from "@/app/actions/messages";
import { Icon } from "./Icon";

type Item = { id: number; title: string; body: string; category: string; read: boolean; created_at: number };
type Api = { unread: number; last: number; fresh: { id: number; title: string; body: string; link: string | null; category: string }[]; items?: Item[] };

const ICON: Record<string, string> = { timetable: "calendar", marks: "star", absence: "absence", classwork: "check", duty: "broom", cash: "coin", notes: "pen", inquiry: "pen" };
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ms);
const dayLabel = (ms: number) => {
  const today = dayKey(Date.now());
  const k = dayKey(ms);
  if (k === today) return "Dnes";
  if (k === dayKey(Date.now() - 86_400_000)) return "Včera";
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", weekday: "long", day: "numeric", month: "numeric" }).format(ms);
};
const timeOf = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(ms);

/** Zvoneček u názvu: odznak s počtem nepřečtených a rozbalovací panel se zprávami (suplování, známky, absence…). */
export function MessageBell({ unread: initial }: { unread: number }) {
  const [unread, setUnread] = useState(initial);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const last = useRef(0);
  const inited = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setUnread(initial), [initial]);
  // číslo na ikoně nainstalované aplikace
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  const load = useCallback(async (list: boolean) => {
    try {
      const r = await fetch(`/api/messages?after=${last.current}${list ? "&list=1" : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as Api;
      setUnread(d.unread);
      if (d.items) setItems(d.items);
      // nerušivé oznámení v rohu, dokud se na Classmate právě díváš
      if (inited.current && document.visibilityState === "visible") {
        for (const m of d.fresh.slice(0, 3).reverse()) window.dispatchEvent(new CustomEvent("classmate:toast", { detail: { title: m.title, body: m.body, href: m.link ?? undefined, icon: ICON[m.category] } }));
      }
      // upozornění prohlížeče, dokud je panel na pozadí (push řeší service worker, stejný tag = žádný duplikát)
      if (inited.current && d.fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
        for (const m of d.fresh.slice(0, 3)) new Notification(m.title, { body: m.body, tag: `classmate-${m.id}` });
      }
      last.current = d.last;
      inited.current = true;
    } catch {}
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => document.visibilityState === "visible" && void load(false), 60_000);
    const vis = () => document.visibilityState === "visible" && void load(false);
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) void load(true);
      return !o;
    });
  }, [load]);

  useEffect(() => {
    const out = (e: Event) => open && !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const ext = () => toggle();
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    window.addEventListener("classmate:messages", ext);
    return () => {
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("classmate:messages", ext);
    };
  }, [open, toggle]);

  const remove = (id?: number) => {
    setItems((l) => (id ? (l ?? []).filter((m) => m.id !== id) : []));
    if (id) setUnread((u) => Math.max(0, u - ((items ?? []).find((m) => m.id === id && !m.read) ? 1 : 0)));
    else setUnread(0);
    void removeMessages(id).then(() => load(true));
  };

  const groups = new Map<string, Item[]>();
  for (const m of items ?? []) groups.set(dayLabel(m.created_at), [...(groups.get(dayLabel(m.created_at)) ?? []), m]);

  return (
    <div className="bell-wrap" ref={wrap}>
      <button className={`bell-btn${open ? " open" : ""}`} onClick={toggle} aria-label={unread ? `Zprávy, ${unread} nepřečtených` : "Zprávy"} aria-expanded={open} title="Zprávy (m)">
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="msg-panel" role="dialog" aria-label="Zprávy">
          <div className="msg-panel-head">
            <b>Zprávy</b>
            <div className="msg-head-actions">
              {unread > 0 && (
                <form action={readAll} onSubmit={() => setTimeout(() => void load(true), 400)}>
                  <button className="link-btn">Označit vše jako přečtené</button>
                </form>
              )}
              {!!items?.length && <button type="button" className="link-btn" onClick={() => remove()}>Smazat vše</button>}
            </div>
          </div>
          <div className="msg-panel-list">
            {items === null && <p className="msg-empty">Načítám…</p>}
            {items?.length === 0 && <p className="msg-empty">Zatím žádné zprávy. Když se změní rozvrh nebo přibude známka, objeví se tady.</p>}
            {[...groups].map(([label, list]) => (
              <div key={label}>
                <div className="msg-day">{label}</div>
                {list.map((m) => (
                  <div key={m.id} className="msg-wrap">
                    <form action={openMessage} onSubmit={() => setOpen(false)} className={`msg${m.read ? "" : " unread"}`}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="msg-btn">
                        <span className="msg-icon"><Icon name={ICON[m.category] ?? "bell"} size={15} /></span>
                        <span className="msg-main">
                          <b>{m.title}</b>
                          {m.body && <span>{m.body}</span>}
                        </span>
                        <time>{timeOf(m.created_at)}</time>
                        {!m.read && <i className="msg-dot" aria-label="Nepřečtená" />}
                      </button>
                    </form>
                    <button type="button" className="msg-del" aria-label={`Smazat zprávu: ${m.title}`} title="Smazat" onClick={() => remove(m.id)}><Icon name="trash" size={13} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="msg-panel-foot">
            <Link href="/nastaveni" onClick={() => setOpen(false)}>Nastavení zpráv a upozornění</Link>
          </div>
        </div>
      )}
    </div>
  );
}
