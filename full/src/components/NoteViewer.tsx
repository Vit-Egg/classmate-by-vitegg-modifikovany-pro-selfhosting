"use client";

import { hasDrawing } from "@/lib/boards";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { NoteImage } from "@/lib/note-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { LatexSuite } from "@/lib/latexSuite";
import "katex/dist/katex.min.css";

/** Poškozený obsah se nesmí propsat do pádu stránky: zobrazí se prázdná poznámka. */
const safeDoc = (content: string) => {
  try {
    return content ? JSON.parse(content) : "";
  } catch {
    return "";
  }
};

/** Poznámka jen ke čtení (sdílená spolužákem). Vzorce se vykreslují stejně jako v editoru. */
const NoteBoards = dynamic(() => import("./NoteBoards"), { ssr: false, loading: () => <div className="board-canvas board-loading">Načítám tabuli…</div> });

export function NoteViewer({ content, board = "" }: { content: string; board?: string }) {
  const [tab, setTab] = useState<"t" | "b">("t");
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [StarterKit.configure({ link: { openOnClick: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }), Highlight, TaskList, TaskItem.configure({ nested: true }), TableKit, NoteImage.configure({ allowBase64: false, HTMLAttributes: { class: "note-img", loading: "lazy" } }), LatexSuite],
    content: safeDoc(content),
    editorProps: { attributes: { class: "note-body", "aria-label": "Text poznámky (jen ke čtení)" } },
  });
  // živé změny od autora: stránka se po události načte znovu a nový text se vymění v editoru
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(safeDoc(content) || { type: "doc", content: [{ type: "paragraph" }] })) editor.commands.setContent(safeDoc(content));
  }, [content, editor]);
  return (
    <>
      {hasDrawing(board) && (
        <div className="seg note-tabs" role="tablist" aria-label="Část poznámky">
          <button type="button" role="tab" aria-pressed={tab === "t"} onClick={() => setTab("t")}>Psané</button>
          <button type="button" role="tab" aria-pressed={tab === "b"} onClick={() => setTab("b")}>Tabule</button>
        </div>
      )}
      {tab === "b" && <NoteBoards initial={board} readOnly />}
      <div hidden={tab !== "t"}><EditorContent editor={editor} className="note-content" /></div>
    </>
  );
}
