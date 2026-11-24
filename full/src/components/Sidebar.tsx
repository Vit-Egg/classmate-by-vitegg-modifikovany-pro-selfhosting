"use client";

import { tapVersion } from "@/lib/version-egg";
import { versionLabel, versionTitle } from "@/lib/version";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { BellWidget } from "./Live";
import { BellFullButton } from "./BellScreen";
import { MessageBell } from "./MessageBell";
import type { Slot } from "@/lib/schedule";

const items = [
  { href: "/dnes", label: "Dnes", icon: "sun" },
  { href: "/rozvrh", label: "Rozvrh", icon: "calendar" },
  { href: "/kalendar", label: "Kalendář", icon: "caldays" },
  { href: "/ukoly", label: "Úkoly", icon: "check" },
  { href: "/testy-a-zkouseni", label: "Testy a zkoušení", icon: "exam" },
  { href: "/studium", label: "Studium", icon: "cap", study: true },
  { href: "/komunikace", label: "Komunikace", icon: "mail" },
  { href: "/obedy", label: "Obědy", icon: "utensils", lunch: true },
  { href: "/denik", label: "Tréninkový deník", icon: "pulse", training: true },
  { href: "/predmety", label: "Předměty", icon: "book" },
  { href: "/widgety", label: "Widgety", icon: "link" },
  { href: "/poznamky", label: "Poznámky", icon: "pen" },
  { href: "/znamky", label: "Známky", icon: "star" },
  { href: "/trofeje", label: "Trofeje", icon: "trophy" },
  { href: "/absence", label: "Absence", icon: "absence" },
  { href: "/sprava", label: "Správa", icon: "shield", admin: true },
  { href: "/nastaveni", label: "Nastavení", icon: "settings" },
];

/** Menu: nahoře jen to, co se používá denně, zbytek je pod „Další“ (sbalené, pamatuje se v prohlížeči). Při sbalení zůstane vidět jen stránka, na které jsi, a zmizí, až z ní odejdeš. */
const GROUPS = [
  { id: "main", label: "", hrefs: ["/dnes", "/rozvrh", "/kalendar", "/ukoly", "/testy-a-zkouseni", "/znamky", "/poznamky", "/predmety", "/studium"] },
  { id: "more", label: "Další", hrefs: ["/komunikace", "/absence", "/obedy", "/denik", "/trofeje", "/widgety"] },
];
const CLOSED_KEY = "nav-closed4";

/** Telefon, panel „Více“: nejdřív tři kategorie, po klepnutí se v tom samém panelu ukážou jejich stránky. */
const MORE_GROUPS = [
  { id: "learn", label: "Učení", icon: "cap", hrefs: ["/znamky", "/poznamky", "/predmety", "/studium", "/kalendar"] },
  { id: "admin", label: "Administrativa", icon: "mail", hrefs: ["/absence", "/komunikace"] },
  { id: "tools", label: "Nástroje", icon: "settings", hrefs: ["/obedy", "/denik", "/trofeje", "/widgety", "/nastaveni", "/sprava"] },
];

const PRIMARY = new Set(["/dnes", "/rozvrh", "/ukoly", "/testy-a-zkouseni"]);

/** Školní zvonek: dvě sinusovky s dozvukem, bez zvukových souborů. */
function ring(ctx: AudioContext) {
  const t = ctx.currentTime;
  for (const [freq, gain] of [[1046, 0.18], [1568, 0.1], [2093, 0.05]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.7);
  }
}

export function Sidebar({ school, className, isAdmin, slots, unread: initialUnread, komens = 0, lunch = false, study = false, cash = false, duty = false, board = false, boardNew = 0, training = false, me }: { me: { name: string; src: string | null }; school: string; className: string; isAdmin: boolean; slots: Slot[]; unread: number; komens?: number; lunch?: boolean; study?: boolean; cash?: boolean; duty?: boolean; board?: boolean; boardNew?: number; training?: boolean }) {
  const path = usePathname();
  const logo = useRef<HTMLButtonElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const [mac, setMac] = useState(false);
  const [more, setMore] = useState(false);
  const [moreView, setMoreView] = useState<string | null>(null);
  const [closed, setClosed] = useState<string[]>(["more"]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLOSED_KEY);
      if (raw) setClosed((JSON.parse(raw) as string[]).filter((x) => typeof x === "string"));
    } catch {}
  }, []);
  const toggle = (id: string) =>
    setClosed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => { setMore(false); setMoreView(null); }, [path]);

  const onLogo = () => {
    const el = logo.current;
    if (el) {
      el.classList.remove("wiggle");
      void el.offsetWidth;
      el.classList.add("wiggle");
    }
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      ring(audio.current);
    } catch {}
  };

  const visible = items.filter((i) => (!i.admin || isAdmin) && (!("lunch" in i) || lunch) && (!("study" in i) || study) && (!("cash" in i) || cash) && (!("duty" in i) || duty) && (!("board" in i) || board) && (!("training" in i) || training));

  const link = (i: (typeof items)[number]) => (
    <Link key={i.href} href={i.href} title={i.label} aria-current={path.startsWith(i.href) ? "page" : undefined} className={PRIMARY.has(i.href) ? undefined : "nav-more"}>
      <Icon name={i.icon} />
      <span className="nav-label">{i.label}</span>
      {i.href === "/nastenka" && boardNew > 0 && <span className="nav-badge">{boardNew > 99 ? "99+" : boardNew}</span>}
      {i.href === "/komunikace" && komens > 0 && <span className="nav-badge">{komens > 99 ? "99+" : komens}</span>}
    </Link>
  );
  const top = visible.filter((i) => i.href !== "/sprava" && i.href !== "/nastaveni");
  const bottom = visible.filter((i) => i.href === "/sprava" || i.href === "/nastaveni");

  return (
    <aside className="sidebar">
      <MessageBell unread={initialUnread} />
      <div className="brand">
        <button ref={logo} className="brand-name logo-btn" onClick={onLogo} aria-label="Classmate – klikni a zazvoní">
          <span className="brand-full">Classmate</span>
          {/* v úzkém pruhu s ikonami se název nevejde, tam je ikona aplikace */}
          <img className="brand-mini" src="/icon.svg" alt="" width={34} height={34} />
        </button>
        <div className="brand-class" title={`${school} · ${className}`}>
          <Link href="/nastaveni?k=ucet" className="me-av" aria-label="Moje profilovka a účet">
            {me.src ? <img src={me.src} alt="" width={22} height={22} /> : me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </Link>
          <span className="brand-class-text"><span>{school}</span><span>{className}</span></span>
        </div>
      </div>
      <button className="search-btn" title="Hledat" onClick={() => window.dispatchEvent(new Event("classmate:palette"))}>
        <Icon name="search" size={15} /> <span className="sb-label">Hledat</span>
        <kbd>{mac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <div className="nav-scroll">
        <nav className="nav" aria-label="Hlavní navigace">
          {GROUPS.map((g, gi) => {
            const list = g.hrefs.map((h) => top.find((i) => i.href === h)).filter((i): i is (typeof items)[number] => !!i);
            if (!list.length) return null;
            const shut = !!g.label && closed.includes(g.id);
            const badge = shut && g.hrefs.includes("/komunikace") && komens > 0;
            return (
              <div key={g.id} className="nav-group" data-shut={shut || undefined}>
                {gi > 0 && <span className="nav-sep" aria-hidden />}
                {g.label && (
                  <button type="button" className="nav-group-h" aria-expanded={!shut} onClick={() => toggle(g.id)}>
                    {g.label}
                    {badge && <i className="nav-dot" aria-label="Nové zprávy" />}
                    <Icon name="chevron" size={13} />
                  </button>
                )}
                <div className="nav-items">{list.map(link)}</div>
              </div>
            );
          })}
          {/* jen na telefonu: ostatní stránky v rozbalovacím panelu */}
          <button className="nav-more-btn" aria-expanded={more} aria-current={visible.some((i) => !PRIMARY.has(i.href) && path.startsWith(i.href)) ? "page" : undefined} onClick={() => { setMore((m) => !m); setMoreView(null); }}>
            <Icon name="dots" />
            Více
          </button>
        </nav>
      </div>
      {more && (
        <>
          <div className="more-scrim" onClick={() => setMore(false)} />
          <div className="more-sheet" role="menu" data-view={moreView ?? "root"}>
            {(() => {
              const cur = MORE_GROUPS.find((g) => g.id === moreView);
              const itemsOf = (g: (typeof MORE_GROUPS)[number]) => g.hrefs.map((h) => visible.find((i) => i.href === h)).filter((i): i is (typeof items)[number] => !!i);
              if (!cur) {
                return (
                  <>
                    {MORE_GROUPS.map((g) => {
                      const list = itemsOf(g);
                      if (!list.length) return null;
                      return (
                        <button key={g.id} role="menuitem" className="more-cat" aria-current={list.some((i) => path.startsWith(i.href)) ? "page" : undefined} onClick={() => setMoreView(g.id)}>
                          <Icon name={g.icon} size={22} />
                          {g.label}
                          {g.id === "admin" && komens > 0 && <span className="nav-badge">{komens > 99 ? "99+" : komens}</span>}
                        </button>
                      );
                    })}
                    <button role="menuitem" onClick={() => { setMore(false); window.dispatchEvent(new Event("classmate:palette")); }}>
                      <Icon name="search" size={22} />
                      Hledat
                    </button>
                  </>
                );
              }
              return (
                <>
                  <button role="menuitem" className="more-back" onClick={() => setMoreView(null)}>
                    <Icon name="chevron" size={16} /> {cur.label}
                  </button>
                  {itemsOf(cur).map((i) => (
                    <Link key={i.href} href={i.href} role="menuitem" aria-current={path.startsWith(i.href) ? "page" : undefined}>
                      <Icon name={i.icon} size={22} />
                      {i.label}
                    </Link>
                  ))}
                </>
              );
            })()}
          </div>
        </>
      )}
      <div className="side-foot">
        <div className="bell-row"><BellWidget slots={slots} /><BellFullButton slots={slots} /></div>
        <nav className="nav nav-foot" aria-label="Správa a nastavení">
          {bottom.map(link)}
        </nav>
        <div className="side-meta">
          <button className="kbd-hint" onClick={() => window.dispatchEvent(new Event("classmate:help"))}>
            Zkratky <kbd>?</kbd>
          </button>
          <button className="kbd-hint" onClick={() => window.dispatchEvent(new CustomEvent("classmate:feedback"))}>
            Mám nápad
          </button>
          <a className="kbd-hint made-by" href="https://plojharsim.cz" target="_blank" rel="noopener">Made by plojharsim</a>
          {versionLabel() && <span className="app-ver" title={versionTitle()} onClick={tapVersion}>{versionLabel()}</span>}
        </div>
      </div>
    </aside>
  );
}
