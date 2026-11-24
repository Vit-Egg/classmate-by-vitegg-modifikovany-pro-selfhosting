"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { NoteImage } from "@/lib/note-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { saveBoard, saveMyVersionAsCopy, saveNote, saveNoteTitle } from "@/app/actions/notes";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { CollabProvider, type CollabStatus } from "@/lib/collab-client";
import { clearDraft, isEmptyDoc, loadDraft, saveDraft, type Draft } from "@/lib/note-draft";
import { NoteHistory } from "./NoteHistory";
import { savePref } from "@/app/actions/settings";
import { isImageFile, uploadNoteImage } from "@/lib/image-upload";
import { LatexSuite } from "@/lib/latexSuite";
import { NoteSaveContext, type NoteSave } from "@/lib/note-save";
import "katex/dist/katex.min.css";

const NoteBoards = dynamic(() => import("./NoteBoards"), { ssr: false, loading: () => <div className="board-canvas board-loading">Načítám tabuli…</div> });

type Status = "saved" | "dirty" | "saving" | "error";

function Btn({ editor, label, title, active, run, disabled }: { editor: Editor; label: React.ReactNode; title: string; active?: boolean; run: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`tb${active ? " on" : ""}`} title={title} aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
}

function Toolbar({ editor, onImages }: { editor: Editor; onImages: () => void }) {
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  // Vlastní okénko místo window.prompt: prompt některé prohlížeče a vestavěné prohlížeče (aplikace, PWA) blokují a tlačítko pak nic neudělá
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const setLink = () => {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  };
  const applyLink = (raw: string) => {
    let url = raw.trim();
    if (!url) {
      c().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? `mailto:${url}` : `https://${url.replace(/^\/+/, "")}`;
    try {
      const u = new URL(url);
      if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return;
    } catch {
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) c().insertContent({ type: "text", text: url.replace(/^(mailto:|tel:)/i, ""), marks: [{ type: "link", attrs: { href: url } }] }).run();
    else c().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  };
  // dokud se společná úprava nepřipojí, editor ještě nemá příkazy Zpět a Znovu (dodává je rozšíření pro spolupráci)
  const can = editor.can() as unknown as { undo?: () => boolean; redo?: () => boolean };
  const canUndo = !!can.undo?.();
  const canRedo = !!can.redo?.();
  const sep = <span className="tb-sep" aria-hidden />;
  return (
    <>
    <div className="toolbar-ed" role="toolbar" aria-label="Formátování">
      <Btn editor={editor} label="H1" title="Nadpis 1 (Ctrl+Alt+1)" active={editor.isActive("heading", { level: 1 })} run={() => c().toggleHeading({ level: 1 }).run()} />
      <Btn editor={editor} label="H2" title="Nadpis 2 (Ctrl+Alt+2)" active={editor.isActive("heading", { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()} />
      <Btn editor={editor} label="H3" title="Nadpis 3 (Ctrl+Alt+3)" active={editor.isActive("heading", { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()} />
      {sep}
      <Btn editor={editor} label={<b>B</b>} title="Tučně (Ctrl+B)" active={editor.isActive("bold")} run={() => c().toggleBold().run()} />
      <Btn editor={editor} label={<i>I</i>} title="Kurzíva (Ctrl+I)" active={editor.isActive("italic")} run={() => c().toggleItalic().run()} />
      <Btn editor={editor} label={<u>U</u>} title="Podtržení (Ctrl+U)" active={editor.isActive("underline")} run={() => c().toggleUnderline().run()} />
      <Btn editor={editor} label={<s>S</s>} title="Přeškrtnutí" active={editor.isActive("strike")} run={() => c().toggleStrike().run()} />
      <Btn editor={editor} label={<mark className="tb-mark">A</mark>} title="Zvýraznění (Ctrl+Shift+H)" active={editor.isActive("highlight")} run={() => c().toggleHighlight().run()} />
      <Btn editor={editor} label="</>" title="Kód v textu" active={editor.isActive("code")} run={() => c().toggleCode().run()} />
      {sep}
      <Btn editor={editor} label="• ―" title="Odrážky" active={editor.isActive("bulletList")} run={() => c().toggleBulletList().run()} />
      <Btn editor={editor} label="1." title="Číslovaný seznam" active={editor.isActive("orderedList")} run={() => c().toggleOrderedList().run()} />
      <Btn editor={editor} label="☑" title="Seznam úkolů" active={editor.isActive("taskList")} run={() => c().toggleTaskList().run()} />
      <Btn editor={editor} label="❝" title="Citace" active={editor.isActive("blockquote")} run={() => c().toggleBlockquote().run()} />
      <Btn editor={editor} label="{ }" title="Blok kódu" active={editor.isActive("codeBlock")} run={() => c().toggleCodeBlock().run()} />
      {sep}
      <Btn editor={editor} label="🔗" title="Odkaz" active={editor.isActive("link")} run={setLink} />
      <Btn editor={editor} label="∑" title="Vzorec (nebo napiš mk)" run={() => { const p = editor.state.selection.from; c().insertContent("$$").setTextSelection(p + 1).run(); }} />
      <Btn editor={editor} label="▦" title="Vložit tabulku" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <Btn editor={editor} label="🖼" title="Vložit obrázek (jde i vložit ze schránky nebo přetáhnout)" run={onImages} />
      <Btn editor={editor} label="―" title="Vodorovná čára" run={() => c().setHorizontalRule().run()} />
      {sep}
      <Btn editor={editor} label="↶" title="Zpět (Ctrl+Z)" disabled={!canUndo} run={() => c().undo().run()} />
      <Btn editor={editor} label="↷" title="Znovu (Ctrl+Shift+Z)" disabled={!canRedo} run={() => c().redo().run()} />
      {inTable && (
        <div className="tb-table" role="group" aria-label="Tabulka">
          <button type="button" className="tb wide" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowAfter().run()}>+ řádek</button>
          <button type="button" className="tb wide" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()}>+ sloupec</button>
          <button type="button" className="tb wide" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()}>− řádek</button>
          <button type="button" className="tb wide" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteColumn().run()}>− sloupec</button>
          <button type="button" className="tb wide danger" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()}>Smazat tabulku</button>
        </div>
      )}
    </div>
    {linkOpen && (
        <form className="tb-link" onSubmit={(e) => { e.preventDefault(); applyLink(href); }}>
          <input
            className="input"
            type="text"
            inputMode="url"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Adresa odkazu, např. https://example.cz"
            aria-label="Adresa odkazu"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); editor.commands.focus(); } }}
          />
          <button type="submit" className="btn small primary">{editor.isActive("link") ? "Uložit" : "Vložit"}</button>
          {editor.isActive("link") && <button type="button" className="btn small" onClick={() => applyLink("")}>Odebrat</button>}
          <button type="button" className="btn small" onClick={() => { setLinkOpen(false); editor.commands.focus(); }}>Zrušit</button>
        </form>
      )}
    </>
  );
}

/** Barva kurzoru spolupracovníka: stálá podle účtu, ať ji všichni vidí stejně. */
const caretColor = (userId: number) => `hsl(${(userId * 47) % 360} 65% 42%)`;

const fmtTime = (ms: number) => new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" }).format(ms);

export function NoteEditor({
  id,
  initialTitle,
  initialSubject,
  initialContent,
  updatedAt,
  subjects,
  initialMode = "e",
  initialBoard = "",
  initialTab = "t",
  rating,
  initialRev = 0,
  initialBoardRev = 0,
  collab,
  audio,
}: {
  id: number;
  initialTitle: string;
  initialSubject: number | null;
  initialContent: string;
  updatedAt: number;
  subjects: { id: number; name: string }[];
  /** e = úpravy, r = čtení (zapamatuje se u účtu) */
  initialMode?: "e" | "r";
  initialBoard?: string;
  /** t = psaný text, b = tabule */
  initialTab?: "t" | "b" | "s";
  /** moje hodnocení poznámky; ukazuje se pod hlavičkou */
  rating?: ReactNode;
  /** číslo verze textu a tabule na serveru; ukládání vychází z něj a při neshodě (změna jinde) se zastaví */
  initialRev?: number;
  initialBoardRev?: number;
  /** společná úprava: text se synchronizuje se spolupracovníky v reálném čase (místo ukládání celé poznámky); předmět mění jen vlastník */
  collab?: { userId: number; name: string; owner: boolean };
  /** nahrávky z hodin; vykreslují se uvnitř, aby zůstaly vidět i na celé obrazovce */
  audio?: ReactNode;
}) {
  const revRef = useRef(initialRev);
  const boardRevRef = useRef(initialBoardRev);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const [copyId, setCopyId] = useState<number | null>(null);
  const collabOn = !!collab;
  const [provider, setProvider] = useState<CollabProvider | null>(null);
  const providerRef = useRef<CollabProvider | null>(null);
  providerRef.current = provider;
  const [link, setLink] = useState<CollabStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [remoteGone, setRemoteGone] = useState<"" | "reset" | "kicked" | string>("");
  const [boardStale, setBoardStale] = useState(false);
  const titleFocus = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const retry = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // poškozený obsah (neplatný JSON): zobrazí se jen text a ukládání je zablokované, ať se originál nepřepíše
  const parsed = useMemo(() => {
    if (!initialContent) return { doc: "" as unknown, corrupt: false };
    try {
      return { doc: JSON.parse(initialContent) as unknown, corrupt: false };
    } catch {
      return { doc: "" as unknown, corrupt: true };
    }
  }, [initialContent]);
  const [tabPref, setTab] = useState<"t" | "b" | "s">(initialTab);
  // zapamatuje si, že uživatel dává přednost zobrazení vedle sebe (jen na širokém okně)
  useEffect(() => {
    try {
      if (localStorage.getItem("note-split") === "1" && window.innerWidth >= 1000 && initialTab === "t") setTab("s");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pickTab = (t: "t" | "b" | "s") => {
    setTab(t);
    // volba „vedle sebe“ se pamatuje, ale mění se jen tam, kde je k dispozici (v celé obrazovce nebo roztažení v okně)
    if (full || t === "s") {
      try {
        localStorage.setItem("note-split", t === "s" ? "1" : "0");
      } catch {}
    }
  };
  const boardRef = useRef(initialBoard);
  const saveBoardJson = useCallback(async (json: string) => {
    boardRef.current = json;
    if (conflictRef.current) return "conflict";
    const r = await saveBoard(id, json, boardRevRef.current);
    if (r.ok) {
      boardRevRef.current = r.boardRev;
      setSavedAt(r.updatedAt);
      return;
    }
    if (r.conflict) {
      conflictRef.current = true;
      setConflict(true);
      return "conflict";
    }
    return r.error;
  }, [id]);
  const [reading, setReading] = useState(initialMode === "r");
  const [full, setFull] = useState(false);
  /** Vedle sebe jde jen ve fullscreenu nebo roztažení v okně; mimo něj se ukazuje obyčejné Psané. */
  const tab = tabPref === "s" && !full ? "t" : tabPref;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState<number | null>(initialSubject);
  const [textStatus, setStatus] = useState<Status>("saved");
  const [boardStatus, setBoardStatus] = useState<Status>("saved");
  const boardFlush = useRef<(() => Promise<void>) | null>(null);
  // jednotný stav ukládání nahoře: platí nejhorší z textu a tabule
  // hodnocení se ukládá samostatně, ale hlásí se sem, takže stav, tlačítko Uložit i odchod ze stránky platí pro celou poznámku
  const [ratingStatus, setRatingStatus] = useState<Status>("saved");
  const ratingFlush = useRef<(() => Promise<void>) | null>(null);
  const noteSave = useMemo<NoteSave>(() => ({ report: setRatingStatus, register: (f) => void (ratingFlush.current = f) }), []);
  const parts = [textStatus, boardStatus, ratingStatus];
  const status: Status = parts.includes("error") ? "error" : parts.includes("saving") ? "saving" : parts.includes("dirty") ? "dirty" : "saved";
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [words, setWords] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const latest = useRef({ title: initialTitle, subject: initialSubject });
  const saving = useRef(false);
  const again = useRef(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  /** Nahraje obrázky a vloží je do textu (na pozici kurzoru, nebo kam se přetáhly). */
  const addImages = useCallback(
    async (files: File[], pos?: number) => {
      const images = files.filter(isImageFile);
      if (!images.length) return;
      setUploadError("");
      for (const f of images) {
        setUploading((n) => n + 1);
        try {
          const { src, alt } = await uploadNoteImage(id, f);
          const chain = editorRef.current?.chain().focus();
          if (pos !== undefined) chain?.insertContentAt(pos, { type: "image", attrs: { src, alt } }).run();
          else chain?.setImage({ src, alt }).run();
        } catch (e) {
          setUploadError((e as Error).message);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    if (!collabOn) return;
    const p = new CollabProvider(id, {
      onStatus: setLink,
      onSynced: () => setSynced(true),
      onMeta: (m) => {
        if (m.title !== undefined && !titleFocus.current) {
          setTitle(m.title);
          latest.current.title = m.title;
        }
      },
      onBoard: (b) => b.by !== collab?.userId && setBoardStale(true),
      onReset: () => setRemoteGone("reset"),
      onKicked: () => setRemoteGone("kicked"),
      onFailed: (msg) => setRemoteGone(msg || "Společnou úpravu se nepovedlo spustit."),
    });
    setProvider(p);
    // do paměti prohlížeče (bfcache) stránka odchází i při přepnutí aplikace na mobilu: spojení se jen odloží a po návratu obnoví,
    // jinak by se úpravy po návratu nikam neposílaly
    const hide = (e: PageTransitionEvent) => (e.persisted ? p.pause() : p.destroy());
    const show = (e: PageTransitionEvent) => e.persisted && p.resume();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      p.destroy();
      setProvider(null);
      setSynced(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, collabOn]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ trailingNode: false, undoRedo: collabOn ? false : undefined, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      NoteImage.configure({ allowBase64: false, HTMLAttributes: { class: "note-img", loading: "lazy" } }),
      LatexSuite,
      Placeholder.configure({ placeholder: "Začni psát… Funguje i Markdown: # nadpis, - seznam, [] úkol, ``` kód." }),
      ...(provider && synced && collab
        ? [
            Collaboration.configure({ document: provider.doc }),
            CollaborationCaret.configure({
              provider,
              user: { name: collab.name, color: caretColor(collab.userId) },
              render: (user) => {
                const el = document.createElement("span");
                el.className = "collab-caret";
                el.style.borderColor = user.color;
                const label = document.createElement("span");
                label.className = "collab-caret-label";
                label.style.backgroundColor = user.color;
                label.textContent = user.name;
                el.append(label);
                return el;
              },
              selectionRender: (user) => ({ nodeName: "span", class: "collab-selection", style: `background-color:${user.color}33` }),
            }),
          ]
        : []),
    ],
    editable: initialMode !== "r" && !parsed.corrupt && !collabOn,
    ...(collabOn ? {} : { content: parsed.doc as never }),
    editorProps: {
      attributes: { class: "note-body", spellcheck: "true", lang: "cs", "aria-label": "Text poznámky" },
      // obrázek vložený ze schránky (snímek obrazovky, kopie z jiné stránky) nebo přetažený soubor
      // v režimu čtení se odkazy otevírají jedním kliknutím
      handleClick: (view, _pos, e) => {
        if (view.editable) return false;
        const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
        if (!a) return false;
        window.open(a.href, "_blank", "noopener,noreferrer");
        return true;
      },
      handlePaste: (_v, e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter(isImageFile);
        if (!files.length) return false;
        void addImages(files);
        return true;
      },
      handleDrop: (view, e) => {
        const files = [...(e.dataTransfer?.files ?? [])].filter(isImageFile);
        if (!files.length) return false;
        e.preventDefault();
        void addImages(files, view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setWords(countWords(editor.getText()));
      if (!collabOn) markDirty();
    },
  }, [provider, synced]);

  useEffect(() => {
    if (collabOn && editor) editor.setEditable(synced && !reading && !parsed.corrupt && !remoteGone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced, reading, remoteGone, collabOn]);

  useEffect(() => {
    editorRef.current = editor;
    if (!editor || editor.isDestroyed) return;
    try {
      setWords(countWords(editor.getText()));
    } catch {
      // editor se právě přestavuje (připojení ke společné úpravě), počet slov se doplní s další změnou
    }
    if (!initialContent && !reading) editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  /** Zapíše aktuální stav do zálohy v prohlížeči (hned, bez čekání na server). */
  const writeDraft = useCallback(() => {
    if (!editor || parsed.corrupt || collabOn) return; // společná úprava se drží na serveru i u ostatních
    saveDraft(id, { title: latest.current.title, subject: latest.current.subject, content: JSON.stringify(editor.getJSON()), text: editor.getText({ blockSeparator: "\n" }), baseRev: revRef.current, at: Date.now() });
  }, [editor, id, parsed.corrupt]);

  const flush = useCallback(async () => {
    if (!editor || !dirty.current || conflictRef.current || parsed.corrupt) return;
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    dirty.current = false;
    setStatus("saving");
    writeDraft();
    try {
      if (collabOn) {
        // text se synchronizuje sám, ukládá se jen název (poslední změna vyhrává)
        const r = await saveNoteTitle(id, latest.current.title, collab?.owner ? latest.current.subject : undefined);
        if (r.ok) {
          retry.current = 0;
          setSavedAt(r.updatedAt);
          setStatus(dirty.current ? "dirty" : "saved");
        } else {
          dirty.current = true;
          setStatus("error");
          scheduleRetry();
        }
        return;
      }
      const res = await saveNote(
        id,
        { title: latest.current.title, subject: latest.current.subject, content: JSON.stringify(editor.getJSON()), text: editor.getText({ blockSeparator: "\n" }) },
        revRef.current,
      );
      if (res.ok) {
        revRef.current = res.rev;
        retry.current = 0;
        setSavedAt(res.updatedAt);
        setStatus(dirty.current ? "dirty" : "saved");
        if (!dirty.current) clearDraft(id);
      } else if (res.conflict) {
        // změna z jiného okna: nic nepřepisovat, zálohu nechat, ukázat volbu
        dirty.current = true;
        conflictRef.current = true;
        setConflict(true);
        setStatus("error");
      } else {
        dirty.current = true;
        setStatus("error");
        scheduleRetry();
      }
    } catch {
      dirty.current = true;
      setStatus("error");
      scheduleRetry();
    } finally {
      saving.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, id, parsed.corrupt, writeDraft]);

  /** Po chybě (výpadek sítě, server) se ukládání zkouší znovu s rostoucími odstupy; záloha v prohlížeči mezitím drží text. */
  const scheduleRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const delay = Math.min(30_000, 3_000 * 2 ** retry.current++);
    retryTimer.current = setTimeout(() => void flushRef.current(), delay);
  };
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 900);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(writeDraft, 250); // záloha v prohlížeči skoro hned
  }, [flush, writeDraft]);

  // před znovunačtením stránky (pozvání, odebrání spolupracovníka) se rozepsané změny zapíšou
  useEffect(() => {
    const on = (e: Event) => {
      (e as CustomEvent<{ promises: Promise<unknown>[] }>).detail.promises.push(flushRef.current(), boardFlush.current?.() ?? Promise.resolve(), ratingFlush.current?.() ?? Promise.resolve());
    };
    window.addEventListener("classmate:note-flush", on);
    return () => window.removeEventListener("classmate:note-flush", on);
  }, []);

  // ulož při odchodu ze stránky / přepnutí záložky
  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    const before = (e: BeforeUnloadEvent) => {
      if (collabOn && providerRef.current?.unsent()) {
        void providerRef.current.flushNow();
        e.preventDefault();
        return;
      }
      if (dirty.current) {
        writeDraft(); // synchronně: server action při zavření karty nemusí dojít
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", hide);
    const leave = () => {
      if (dirty.current) writeDraft();
      void flush();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", before);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("pagehide", leave);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush, writeDraft]);

  // při otevření: záloha z tohoto prohlížeče, kterou se nepovedlo uložit na server
  useEffect(() => {
    if (!editor || collabOn) return;
    const d = loadDraft(id);
    if (!d) return;
    if (isEmptyDoc(d.content, d.text) || d.content === JSON.stringify(editor.getJSON()) || d.text.trim() === editor.getText({ blockSeparator: "\n" }).trim()) {
      clearDraft(id); // stejné jako na serveru
      return;
    }
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Ctrl/Cmd+S = uložit hned
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNowRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush, editor]);

  // po návratu připojení nebo na kartu se neuložené změny odešlou hned, ne až po dalším pokusu s odstupem
  useEffect(() => {
    const kick = () => {
      if (document.visibilityState === "hidden" || !dirty.current) return;
      retry.current = 0;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      void flushRef.current();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, []);

  const setMode = useCallback((r: boolean) => {
    if (r) {
      if (timer.current) clearTimeout(timer.current);
      void flush(); // rozepsané se uloží, než se úpravy zamknou
    }
    setReading(r);
    editor?.setEditable(!r);
    if (!r) editor?.commands.focus();
    void savePref("note_mode", r ? "r" : "e");
  }, [editor, flush]);

  // Ctrl/Cmd+E přepíná mezi úpravami a čtením
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode(!reading);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, setMode]);

  /** Celá obrazovka: překryje aplikaci a, kde to jde, přepne i okno prohlížeče. Esc ji ukončí. */
  const screenRef = useRef(false);
  /** `screen` = i celá obrazovka prohlížeče; bez něj se jen roztáhne v okně (zůstane vidět panel prohlížeče a zbytek počítače). */
  const toggleFull = useCallback((on: boolean, screen = true) => {
    setFull(on);
    screenRef.current = on && screen;
    try {
      if (on && screen) void wrapRef.current?.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen();
    } catch {}
  }, []);
  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = "hidden";
    document.body.classList.add("note-full");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && !(e.target as HTMLElement | null)?.closest?.(".excalidraw") && toggleFull(false);
    // prohlížeč při Esc ukončí svou celou obrazovku sám, překryv musí zmizet s ní (u celé obrazovky v okně se nic takového neděje)
    const onFs = () => screenRef.current && !document.fullscreenElement && setFull(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("note-full");
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [full, toggleFull]);

  const [savingNow, setSavingNow] = useState(false);
  /** Tlačítko Uložit: hned odešle všechno rozepsané (text, název i tabuli) a ukáže výsledek. */
  const saveNow = async () => {
    if (savingNow) return;
    setSavingNow(true);
    try {
      if (collabOn) await providerRef.current?.flushNow();
      dirty.current = true;
      await flush();
      await boardFlush.current?.();
      await ratingFlush.current?.();
      if (!dirty.current && !(collabOn && providerRef.current?.unsent())) setSavedAt(Date.now());
    } finally {
      setSavingNow(false);
    }
  };

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  const statusText = collabOn && !synced ? (remoteGone ? "Bez spojení" : "Připojuji se…") : collabOn && link === "offline" ? "Offline – změny se odešlou po připojení" : conflict ? "Ukládání pozastaveno (změna jinde)" : status === "saving" ? "Ukládám…" : status === "dirty" ? "Neuloženo" : status === "error" ? (retry.current >= 3 ? "Uložení se nepovedlo (změny jsou zálohované v prohlížeči), zkus Uložit nebo načíst stránku znovu" : "Uložení se nepovedlo, zkouším znovu") : `Uloženo v ${fmtTime(savedAt)}`;

  return (
    <NoteSaveContext.Provider value={noteSave}>
    <div ref={wrapRef} className={`note-wrap${reading ? " reading" : ""}${full ? " full" : ""}`}>
      <input
        className="note-title"
        readOnly={reading}
        value={title}
        placeholder="Název poznámky"
        maxLength={200}
        aria-label="Název poznámky"
        onFocus={() => (titleFocus.current = true)}
        onBlur={() => (titleFocus.current = false)}
        onChange={(e) => {
          setTitle(e.target.value);
          latest.current.title = e.target.value;
          markDirty();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editor?.commands.focus("start");
          }
        }}
        autoFocus={!initialTitle && !initialContent}
      />
      {parsed.corrupt && (
        <div className="note-alert danger" role="alert">
          <b>Obsah téhle poznámky je poškozený.</b> Zobrazuje se jen prostý text a úpravy jsou vypnuté, aby se originál nepřepsal. Starší verzi můžeš obnovit tlačítkem Historie.
        </div>
      )}
      {remoteGone && (
        <div className="note-alert danger" role="alert">
          {remoteGone === "kicked" ? (
            <><b>K téhle poznámce už nemáš přístup</b> (vlastník tě odebral nebo ji smazal).</>
          ) : remoteGone === "reset" ? (
            <><b>Poznámka se změnila mimo společnou úpravu</b> (obnovení verze nebo úprava z jiného nástroje). Načti ji znovu.</>
          ) : (
            <><b>{remoteGone}</b></>
          )}
          <span className="btn-row">
            {remoteGone === "kicked" ? <a className="btn small primary" href="/poznamky">Zpět na poznámky</a> : <button type="button" className="btn small primary" onClick={() => window.location.reload()}>Načíst znovu</button>}
            {remoteGone !== "kicked" && editor && (copyId ? (
              <a className="btn small" href={`/poznamky/${copyId}`}>Otevřít uloženou kopii</a>
            ) : (
              <button type="button" className="btn small" onClick={async () => {
                const r = await saveMyVersionAsCopy(id, { title: latest.current.title, content: JSON.stringify(editor.getJSON()), text: editor.getText({ blockSeparator: "\n" }), board: boardRef.current });
                if (r.ok) setCopyId(r.newId);
                else setUploadError(r.error);
              }}>Uložit moje změny jako novou poznámku</button>
            ))}
          </span>
        </div>
      )}
      {boardStale && tab !== "b" && !remoteGone && (
        <div className="note-alert" role="status">
          <b>Někdo upravil tabuli.</b> Pro zobrazení změn ji načti znovu (tvoje nezapsané změny textu se uloží samy).
          <span className="btn-row">
            <button type="button" className="btn small primary" onClick={async () => { await boardFlush.current?.(); window.location.reload(); }}>Načíst tabuli</button>
            <button type="button" className="btn small" onClick={() => setBoardStale(false)}>Později</button>
          </span>
        </div>
      )}
      {draft && !conflict && (
        <div className="note-alert" role="alert">
          <b>Našel jsem neuložené změny z tohoto zařízení</b> (z {fmtTime(draft.at)}). Chceš je obnovit?
          <span className="btn-row">
            <button type="button" className="btn small primary" onClick={() => {
              try {
                editor?.commands.setContent(JSON.parse(draft.content));
                latest.current = { title: draft.title, subject: draft.subject };
                setTitle(draft.title);
                setSubject(draft.subject);
                markDirty();
              } catch {}
              setDraft(null);
            }}>Obnovit</button>
            <button type="button" className="btn small" onClick={() => { clearDraft(id); setDraft(null); }}>Zahodit</button>
          </span>
        </div>
      )}
      {conflict && (
        <div className="note-alert danger" role="alert">
          <b>Tuhle poznámku jsi mezitím změnil jinde</b> (jiné okno nebo zařízení). Ukládání je pozastavené, aby se nepřepsala novější verze. Tvoje změny jsou v tomhle prohlížeči zálohované.
          <span className="btn-row">
            {copyId ? (
              <a className="btn small primary" href={`/poznamky/${copyId}`}>Otevřít uloženou kopii</a>
            ) : (
              <button type="button" className="btn small primary" onClick={async () => {
                if (!editor) return;
                const r = await saveMyVersionAsCopy(id, { title: latest.current.title, content: JSON.stringify(editor.getJSON()), text: editor.getText({ blockSeparator: "\n" }), board: boardRef.current });
                if (r.ok) {
                  setCopyId(r.newId);
                  clearDraft(id);
                } else setUploadError(r.error);
              }}>Uložit moje změny jako novou poznámku</button>
            )}
            <button type="button" className="btn small" onClick={() => window.location.reload()}>Načíst novou verzi</button>
          </span>
        </div>
      )}
      <div className="note-bar">
        <div className="note-bar-left">
        {reading || (collabOn && !collab?.owner) ? (
          subject && <span className="chip">{subjects.find((s) => s.id === subject)?.name ?? ""}</span>
        ) : (
        <select
          className="select small-select"
          value={subject ?? ""}
          aria-label="Předmět"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setSubject(v);
            latest.current.subject = v;
            markDirty();
          }}
        >
          <option value="">Bez předmětu</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        )}
        <span className={`save-state ${status}`} role="status">{uploading ? `Nahrávám obrázek…` : statusText}</span>
        </div>
        <div className="note-bar-right">
        {!reading && !parsed.corrupt && <button type="button" className="btn small primary save-now" onClick={() => void saveNow()} disabled={savingNow} title="Uložit hned (Ctrl+S)">{savingNow ? "Ukládám…" : "Uložit"}</button>}
        {uploadError && <span className="msg-error" role="alert">{uploadError}</span>}
        {(!collabOn || collab?.owner) && <NoteHistory id={id} beforeRestore={async () => { await flush(); await boardFlush.current?.(); conflictRef.current = true; }} />}
        <button type="button" className="icon-btn full-btn" aria-pressed={full} aria-label={full ? "Zavřít celou obrazovku" : "Celá obrazovka"} title={full ? "Zavřít celou obrazovku (Esc)" : "Celá obrazovka"} onClick={() => toggleFull(!full)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {full ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
          </svg>
        </button>
        {!full && (
          <button type="button" className="icon-btn full-btn" aria-label="Roztáhnout v okně" title="Roztáhnout přes celé okno (bez celé obrazovky prohlížeče)" onClick={() => toggleFull(true, false)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8v6H8z" /></svg>
          </button>
        )}
        <div className="seg seg-sm mode-seg" role="group" aria-label="Režim poznámky">
          <button type="button" aria-pressed={!reading} onClick={() => setMode(false)} title="Úpravy (Ctrl+E)">Úpravy</button>
          <button type="button" aria-pressed={reading} onClick={() => setMode(true)} title="Čtení (Ctrl+E)">Čtení</button>
        </div>
        </div>
      </div>
      {rating}
      <div className="seg seg-sm note-tabs" role="tablist" aria-label="Část poznámky">
        <button type="button" role="tab" aria-selected={tab === "t"} aria-pressed={tab === "t"} onClick={() => pickTab("t")}>Psané</button>
        <button type="button" role="tab" aria-selected={tab === "b"} aria-pressed={tab === "b"} onClick={() => pickTab("b")}>Tabule</button>
        {full && <button type="button" role="tab" className="tab-split" aria-selected={tab === "s"} aria-pressed={tab === "s"} onClick={() => pickTab("s")} title="Poznámky a tabule vedle sebe">Vedle sebe</button>}
      </div>
      <div className={tab === "s" ? "note-split" : undefined}>
      <div className="note-split-text" hidden={tab === "b"}>
      {editor && !reading && <Toolbar editor={editor} onImages={() => fileInput.current?.click()} />}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <EditorContent editor={editor} className="note-content" />
      {!reading && <details className="math-help">
        <summary>Matematika (LaTeX)</summary>
        <div>
          <p>Vzorec napiš mezi <code>$…$</code>. Rychle ho založíš zkratkou <code>mk</code> (na začátku řádku <code>dm</code> pro samostatný). Mimo kurzor se vykreslí, kliknutím ho upravíš.</p>
          <ul>
            <li><code>a/</code> nebo <code>//</code> → zlomek</li>
            <li><code>sq</code> → odmocnina, <code>ee</code> → e<sup>x</sup></li>
            <li><code>td</code> → horní index, <code>__</code> → dolní index, <code>sr</code> → ², <code>cb</code> → ³</li>
            <li><code>@a</code> → α, <code>@b</code> → β, <code>@D</code> → Δ, <code>@p</code> → π …</li>
            <li><code>=&gt;</code> ⟹, <code>-&gt;</code> →, <code>!=</code> ≠, <code>&gt;=</code> ≥, <code>&lt;=</code> ≤, <code>xx</code> ×, <code>**</code> ·</li>
            <li><code>sum</code>, <code>lim</code>, <code>int</code>, <code>dint</code>, <code>part</code>, <code>pmat</code>, <code>cases</code></li>
            <li><code>xhat</code>, <code>xbar</code>, <code>xvec</code> → x̂, x̄, x⃗; <code>sin</code>, <code>cos</code>, <code>ln</code> … s zpětným lomítkem</li>
            <li><code>2+3=</code> → hned za rovnítkem se ukáže výsledek, <kbd>Tab</kbd> ho vloží (umí zlomky, odmocniny, mocniny, závorky, procenta, sin a cos ve stupních).</li>
            <li>Závorky se zavírají samy, <kbd>Tab</kbd> vyskočí ze závorky nebo ze vzorce.</li>
          </ul>
        </div>
      </details>}
      <p className="note-foot">{words} {words === 1 ? "slovo" : words >= 2 && words <= 4 ? "slova" : "slov"}</p>
      </div>
      <div className="note-split-board">
        {tab !== "t" && <NoteBoards initial={boardRef.current} draftId={id} readOnly={reading} onSave={saveBoardJson} onStatus={setBoardStatus} flushRef={boardFlush} />}
      </div>
      </div>
      {audio}
    </div>
    </NoteSaveContext.Provider>
  );
}

const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
