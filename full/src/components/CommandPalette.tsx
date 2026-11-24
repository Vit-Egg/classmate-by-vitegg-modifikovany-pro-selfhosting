"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { createNote } from "@/app/actions/notes";
import { syncNow } from "@/app/actions/settings";
import { ACCENTS, applyAccent, applyTheme } from "@/lib/theme";
import { downloadMyData } from "@/lib/download";
import { promptInstall } from "@/lib/pwa";
import { savePref } from "@/app/actions/settings";
import { SHORTCUTS, type KeyMap } from "@/lib/shortcuts";
import { Icon } from "./Icon";

type Cmd = { id: string; title: string; group: string; icon: string; hint?: string; keywords?: string; run: () => void | Promise<void> };
type Remote = { subjects?: { id: number; name: string }[]; notes: { id: number; title: string; subject: string | null }[]; tasks: { id: number; title: string; subject?: string; due: string | null }[]; tests: { id: number; subject: string; date: string; topic: string }[] };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette({ isAdmin, keys, lunch = false, study = false, duty = false, board = false, cash = false, training = false }: { isAdmin: boolean; keys: KeyMap; lunch?: boolean; study?: boolean; duty?: boolean; board?: boolean; cash?: boolean; training?: boolean }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [mac, setMac] = useState(false);

  const close = useCallback(() => dlg.current?.close(), []);
  const open = useCallback(() => {
    if (dlg.current?.open) return;
    setQ("");
    setActive(0);
    dlg.current?.showModal();
    fetch("/api/palette", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setRemote(d)).catch(() => {});
  }, []);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dlg.current?.open) close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("classmate:palette", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("classmate:palette", open);
    };
  }, [open, close]);

  const go = useCallback((href: string) => () => (window.dispatchEvent(new Event("classmate:nav-start")), router.push(href)), [router]);

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = SHORTCUTS.filter((x) => x.href && (!x.admin || isAdmin))
      .map(({ id: sid, href, label }) => [keys[sid], href!, label] as const)
      .map(([k, href, label]) => ({ id: `nav-${href}`, title: label, group: "Přejít na", icon: ({ "/dnes": "sun", "/rozvrh": "calendar", "/kalendar": "caldays", "/ukoly": "check", "/testy-a-zkouseni": "exam", "/predmety": "book", "/poznamky": "pen", "/znamky": "star", "/trofeje": "trophy", "/absence": "absence", "/sprava": "shield", "/nastaveni": "settings" } as Record<string, string>)[href], hint: k, run: go(href) }));
    // stránky bez klávesové zkratky; moduly, které si uživatel nebo třída nezapnuly, se nenabízejí (stejně jako v menu)
    const more: [string, string, string, string, boolean, string?][] = [
      ["/komunikace", "Komunikace", "mail", "komens nástěnka školní e-mail teams zprávy pošta", true],
      ["/studium", "Studium", "cap", "učení kartičky procvičování souhrn", study],
      ["/widgety", "Widgety", "link", "widgety plugin vložit classmate nástěnka embed", true],
      ["/obedy", "Obědy", "utensils", "jídelna strava jídelníček objednat oběd", lunch],
      ["/denik", "Tréninkový deník", "pulse", "sport trénink aktivní sportovec tělocvik tev intervals reflexe", training],
    ];
    nav.push(...more.filter((m) => m[4]).map(([href, title, icon, keywords]): Cmd => ({ id: `nav-${href}`, title, group: "Přejít na", icon, keywords, run: go(href) })));
    const actions: Cmd[] = [
      { id: "messages", title: "Zprávy", group: "Akce", icon: "bell", hint: keys.zpravy, keywords: "oznámení zvoneček suplování", run: () => { window.dispatchEvent(new Event("classmate:messages")); } },
      { id: "new-note", title: "Nová poznámka", group: "Akce", icon: "plus", keywords: "napsat zápis", run: () => createNote(new FormData()) },
      { id: "new-task", title: "Nový úkol", group: "Akce", icon: "plus", keywords: "domácí úkol zadání", run: go("/ukoly?new=1") },
      { id: "new-test", title: "Nový test nebo zkoušení", group: "Akce", icon: "plus", keywords: "písemka zkoušení test", run: go("/testy-a-zkouseni?new=1") },
      { id: "sync", title: "Synchronizovat rozvrh a známky", group: "Akce", icon: "refresh", keywords: "bakalari aktualizovat načíst", run: async () => { await syncNow(); router.refresh(); } },
      { id: "tt-next", title: "Rozvrh na příští týden", group: "Akce", icon: "calendar", run: go("/rozvrh?t=pristi") },
      { id: "tt-perm", title: "Stálý rozvrh", group: "Akce", icon: "calendar", run: go("/rozvrh?t=staly") },
      { id: "tt-vert", title: "Rozvrh vertikálně", group: "Akce", icon: "calendar", run: () => { document.cookie = "tt_view=v; path=/; max-age=31536000; samesite=lax"; void savePref("tt_view", "v"); router.push("/rozvrh?o=v"); } },
      { id: "tt-horiz", title: "Rozvrh horizontálně", group: "Akce", icon: "calendar", run: () => { document.cookie = "tt_view=h; path=/; max-age=31536000; samesite=lax"; void savePref("tt_view", "h"); router.push("/rozvrh?o=h"); } },
      { id: "achievements", title: "Trofeje", group: "Přejít na", icon: "trophy", keywords: "pochvaly úspěchy odznaky achievementy", run: go("/trofeje") },
      { id: "tasks-done", title: "Hotové úkoly", group: "Akce", icon: "check", run: go("/ukoly?v=hotove") },
      { id: "today-edit", title: "Upravit stránku Dnes", group: "Akce", icon: "settings", keywords: "panely pořadí sloupce vzhled domovská úvodní", run: go("/dnes?upravit=1") },
      { id: "notes-trash", title: "Koš poznámek", group: "Akce", icon: "trash", keywords: "smazané obnovit", run: go("/poznamky?k=kos") },
      { id: "cal-sub", title: "Odebírat kalendář v telefonu", group: "Akce", icon: "caldays", keywords: "webcal google apple outlook odběr feed", run: go("/kalendar") },
      { id: "set-notify", title: "Nastavení oznámení a e-mailů", group: "Nastavení", icon: "bell", keywords: "push upozornění zprávy e-mail souhrn", run: go("/nastaveni?k=oznameni") },
      { id: "set-links", title: "Propojení: Bakaláři, školní e-mail, Todoist, Strava", group: "Nastavení", icon: "link", keywords: "bakalari propojit odpojit", run: go("/nastaveni?k=propojeni") },
      { id: "set-todoist", title: "Todoist", group: "Nastavení", icon: "check", keywords: "propojit úkoly synchronizace oauth token", run: go("/nastaveni?k=propojeni#todoist") },
      { id: "set-school", title: "Škola a předměty", group: "Nastavení", icon: "book", keywords: "shrnutí umělá inteligence", run: go("/nastaveni?k=skola") },
      { id: "set-keys", title: "Vlastní klávesové zkratky", group: "Nastavení", icon: "keyboard", keywords: "klávesy zkratky změnit", run: go("/nastaveni?k=obecne#zkratky") },
      { id: "theme-light", title: "Světlý vzhled", group: "Vzhled", icon: "sun", keywords: "motiv theme", run: () => applyTheme("light") },
      { id: "theme-dark", title: "Tmavý vzhled", group: "Vzhled", icon: "moon", keywords: "motiv theme", run: () => applyTheme("dark") },
      { id: "theme-auto", title: "Vzhled podle zařízení", group: "Vzhled", icon: "settings", keywords: "motiv theme automaticky", run: () => applyTheme("auto") },
      ...ACCENTS.map((a): Cmd => ({ id: `accent-${a.id}`, title: `Barva: ${a.name}`, group: "Vzhled", icon: "settings", keywords: "motiv barva accent", run: () => applyAccent(a.id) })),
      { id: "install", title: "Nainstalovat aplikaci", group: "Účet", icon: "download", keywords: "pwa plocha aplikace", run: async () => { if (!(await promptInstall())) router.push("/nastaveni?k=obecne"); } },
      { id: "2fa", title: "Dvoufázové ověření", group: "Účet", icon: "shield", keywords: "2fa zabezpečení kódy", run: go("/nastaveni?k=ucet") },
      { id: "export", title: "Stáhnout moje data", group: "Účet", icon: "download", keywords: "export gdpr", run: async () => { const err = await downloadMyData(); if (err) window.alert(err); } },
      { id: "fb-idea", title: "Mám nápad na vylepšení", group: "Zpětná vazba", icon: "pen", keywords: "feedback napad vylepseni zpetna vazba", run: () => { window.dispatchEvent(new CustomEvent("classmate:feedback", { detail: "napad" })); } },
      { id: "fb-bug", title: "Našel jsem chybu", group: "Zpětná vazba", icon: "pen", keywords: "bug chyba nahlasit problem", run: () => { window.dispatchEvent(new CustomEvent("classmate:feedback", { detail: "bug" })); } },
      { id: "help", title: "Klávesové zkratky", group: "Účet", icon: "keyboard", hint: "?", run: () => { window.dispatchEvent(new Event("classmate:help")); } },
      { id: "logout", title: "Odhlásit se", group: "Účet", icon: "logout", keywords: "odhlášení", run: () => logoutAction() },
    ];
    const dyn: Cmd[] = remote
      ? [
          ...(remote.subjects ?? []).map((s) => ({ id: `subject-${s.id}`, title: s.name, group: "Předměty", icon: "book", run: go(`/predmety/${s.id}`) })),
          ...remote.notes.map((n) => ({ id: `note-${n.id}`, title: n.title || "Bez názvu", group: "Poznámky", icon: "pen", hint: n.subject ?? undefined, run: go(`/poznamky/${n.id}`) })),
          ...remote.tasks.map((t) => ({ id: `task-${t.id}`, title: t.title, group: "Úkoly", icon: "check", hint: t.subject, run: go("/ukoly") })),
          ...remote.tests.map((t) => ({ id: `test-${t.id}`, title: `${t.subject}${t.topic ? ` – ${t.topic}` : ""}`, group: "Testy a zkoušení", icon: "exam", hint: t.date.split("-").reverse().slice(0, 2).map(Number).join(". ") + ".", run: go("/testy-a-zkouseni") })),
        ]
      : [];
    return [...nav, ...actions, ...dyn];
  }, [go, isAdmin, keys, remote, router]);

  const results = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) {
      const first = commands.filter((c) => c.group === "Přejít na" || c.group === "Akce").slice(0, 14);
      return [...first, ...commands.filter((c) => c.group === "Poznámky").slice(0, 4)];
    }
    return commands
      .map((c) => {
        const hay = fold(`${c.title} ${c.keywords ?? ""} ${c.group} ${c.hint ?? ""}`);
        if (!terms.every((t) => hay.includes(t))) return null;
        const title = fold(c.title);
        const score = (title.startsWith(terms[0]) ? 0 : title.includes(terms[0]) ? 1 : 2) * 10 + (c.group === "Přejít na" ? 0 : c.group === "Akce" ? 1 : 2);
        return { c, score };
      })
      .filter((x): x is { c: Cmd; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 40)
      .map((x) => x.c);
  }, [q, commands]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const exec = (c?: Cmd) => {
    if (!c) return;
    close();
    void c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); exec(results[active]); }
  };

  let lastGroup = "";
  return (
    <dialog ref={dlg} className="palette" aria-label="Příkazová paleta" onClick={(e) => e.target === dlg.current && close()}>
      <div className="palette-card" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledej stránku, poznámku, úkol nebo akci…" aria-label="Hledat" autoComplete="off" spellCheck={false} autoFocus />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {results.length === 0 && <p className="palette-empty">Nic jsem nenašel.</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? ((lastGroup = c.group), <div className="palette-group" key={`g-${c.group}-${i}`}>{c.group}</div>) : null;
            return (
              <div key={c.id}>
                {header}
                <button role="option" aria-selected={i === active} data-i={i} className={`palette-item${i === active ? " active" : ""}`} onMouseMove={() => setActive(i)} onClick={() => exec(c)}>
                  <span className="pi-icon"><Icon name={c.icon} size={16} /></span>
                  <span className="pi-title">{c.title}</span>
                  {c.hint && (c.hint.length === 1 ? <kbd>{c.hint}</kbd> : <span className="pi-hint">{c.hint}</span>)}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> výběr</span>
          <span><kbd>↵</kbd> otevřít</span>
          <span style={{ marginLeft: "auto" }}><kbd>{mac ? "⌘" : "Ctrl"}</kbd> <kbd>K</kbd></span>
        </div>
      </div>
    </dialog>
  );
}
