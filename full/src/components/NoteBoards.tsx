"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_BOARD_NAME, MAX_BOARDS, newBoard, parseBoards, serializeBoards, type Board } from "@/lib/boards";

const NoteBoard = dynamic(() => import("./NoteBoard"), { ssr: false, loading: () => <div className="board-canvas board-loading">Načítám tabuli…</div> });

type Status = "saved" | "dirty" | "saving" | "error";

type Props = {
  /** obsah sloupce notes.board (prázdné, jedna scéna, nebo více tabulí) */
  initial: string;
  readOnly?: boolean;
  draftId?: number;
  /** uloží celé pole tabulí jako jeden řetězec; vrací chybovou hlášku, nebo nic */
  onSave?: (raw: string) => Promise<string | void>;
  onStatus?: (s: Status) => void;
  flushRef?: { current: (() => Promise<void>) | null };
};

/** Více tabulí v jedné poznámce: záložky nad plátnem, přidání, přejmenování a smazání. */
export default function NoteBoards({ initial, readOnly = false, draftId, onSave, onStatus, flushRef }: Props) {
  const boards = useRef<Board[]>(parseBoards(initial));
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);
  const [activeId, setActiveId] = useState(() => {
    const l = boards.current;
    // ve čtení rovnou první tabule, na které něco je
    return (readOnly ? l.find((b) => b.scene) : undefined)?.id ?? l[0].id;
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [childState, setChildState] = useState<Status>("saved");
  const [structState, setStructState] = useState<Status>("saved");
  const chain = useRef<Promise<string | void>>(Promise.resolve());
  const childFlush = useRef<(() => Promise<void>) | null>(null);

  const list = readOnly && boards.current.length > 1 ? boards.current.filter((b) => b.scene) : boards.current;
  const cur = list.find((b) => b.id === activeId) ?? list[0];

  /** ukládání jde vždy po jednom, ať si dvě rychlé změny nepřepíšou číslo verze */
  const push = useCallback(() => {
    if (!onSave) return Promise.resolve();
    const raw = serializeBoards(boards.current);
    const p = chain.current.then(() => onSave(raw));
    chain.current = p.catch(() => undefined);
    return p;
  }, [onSave]);

  const saveScene = useCallback(
    async (id: string, json: string) => {
      const b = boards.current.find((x) => x.id === id);
      if (!b) return; // tabule mezitím zmizela
      b.scene = json;
      return push();
    },
    [push],
  );

  const structure = async () => {
    rerender();
    setStructState("saving");
    let err: string | void;
    try {
      err = await push();
    } catch {
      err = "Uložení se nepovedlo.";
    }
    setStructState(err ? "error" : "saved");
  };

  const onChildSave = useCallback((json: string) => saveScene(cur.id, json), [saveScene, cur?.id]);

  useEffect(() => {
    const s: Status = [childState, structState].includes("error") ? "error" : [childState, structState].includes("saving") ? "saving" : [childState, structState].includes("dirty") ? "dirty" : "saved";
    onStatus?.(s);
  }, [childState, structState, onStatus]);

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      await childFlush.current?.();
      await chain.current;
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef]);

  const add = async () => {
    if (boards.current.length >= MAX_BOARDS) return;
    await childFlush.current?.();
    const b = newBoard(`${DEFAULT_BOARD_NAME} ${boards.current.length + 1}`);
    boards.current.push(b);
    setActiveId(b.id);
    void structure();
  };

  const remove = async (b: Board) => {
    if (boards.current.length < 2) return;
    if (!window.confirm(`Smazat tabuli „${b.name}“ i s jejím obsahem?`)) return;
    const i = boards.current.indexOf(b);
    boards.current.splice(i, 1);
    setActiveId(boards.current[Math.max(0, i - 1)].id);
    void structure();
  };

  const rename = (b: Board, name: string) => {
    setEditing(null);
    const n = name.trim().slice(0, 60);
    if (!n || n === b.name) return;
    b.name = n;
    void structure();
  };

  const showTabs = !readOnly || list.length > 1;

  return (
    <div className="boards">
      {showTabs && (
        <div className="board-tabs" role="tablist" aria-label="Tabule v poznámce">
          {list.map((b) =>
            editing === b.id ? (
              <input
                key={b.id}
                className="input board-tab-input"
                autoFocus
                defaultValue={b.name}
                maxLength={60}
                aria-label="Název tabule"
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => rename(b, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span key={b.id} className={`board-tab${b.id === cur.id ? " on" : ""}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={b.id === cur.id}
                  className="board-tab-name"
                  onClick={async () => {
                    if (b.id === cur.id) return;
                    await childFlush.current?.();
                    setActiveId(b.id);
                  }}
                  onDoubleClick={() => !readOnly && setEditing(b.id)}
                  title={readOnly ? b.name : "Dvojklik přejmenuje tabuli"}
                >
                  {b.name}
                </button>
                {!readOnly && b.id === cur.id && (
                  <>
                    <button type="button" className="board-tab-x" aria-label={`Přejmenovat tabuli ${b.name}`} title="Přejmenovat" onClick={() => setEditing(b.id)}>✎</button>
                    {boards.current.length > 1 && <button type="button" className="board-tab-x" aria-label={`Smazat tabuli ${b.name}`} title="Smazat tabuli" onClick={() => void remove(b)}>×</button>}
                  </>
                )}
              </span>
            ),
          )}
          {!readOnly && boards.current.length < MAX_BOARDS && (
            <button type="button" className="board-tab-add" onClick={() => void add()} aria-label="Přidat tabuli" title="Přidat další tabuli">+</button>
          )}
        </div>
      )}
      <NoteBoard
        key={cur.id}
        initial={cur.scene}
        draftId={draftId === undefined ? undefined : `${draftId}:${cur.id}`}
        readOnly={readOnly}
        onSave={readOnly ? undefined : onChildSave}
        onStatus={setChildState}
        flushRef={childFlush}
      />
    </div>
  );
}
