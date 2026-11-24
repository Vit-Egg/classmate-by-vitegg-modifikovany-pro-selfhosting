/**
 * Více tabulí v jedné poznámce. Do sloupce notes.board se ukládá buď prázdný řetězec, jedna scéna Excalidrawu
 * (starší poznámky), nebo obálka {"type":"classmate-boards","boards":[{id,name,scene}]}, kde scene je scéna jako text.
 */
export type Board = { id: string; name: string; scene: string };

export const MAX_BOARDS = 20;
export const DEFAULT_BOARD_NAME = "Tabule";

const newId = () => Math.random().toString(36).slice(2, 10);

export function newBoard(name = DEFAULT_BOARD_NAME, scene = ""): Board {
  return { id: newId(), name, scene };
}

export function parseBoards(raw: string): Board[] {
  if (!raw) return [newBoard(DEFAULT_BOARD_NAME)];
  try {
    const j = JSON.parse(raw);
    if (j && j.type === "classmate-boards" && Array.isArray(j.boards)) {
      const list = (j.boards as Board[])
        .filter((b) => b && typeof b.id === "string" && typeof b.scene === "string")
        .map((b) => ({ id: b.id, name: typeof b.name === "string" && b.name.trim() ? b.name.slice(0, 60) : DEFAULT_BOARD_NAME, scene: b.scene }));
      if (list.length) return list;
    }
  } catch {}
  // jedna stará scéna
  return [{ id: "1", name: DEFAULT_BOARD_NAME, scene: raw }];
}

/** Nic nenakresleno a jen jedna tabule s výchozím názvem = v databázi prázdný řetězec. */
export function serializeBoards(list: Board[]): string {
  if (list.length === 1 && !list[0].scene && list[0].name === DEFAULT_BOARD_NAME) return "";
  if (list.length === 1 && list[0].name === DEFAULT_BOARD_NAME && list[0].id === "1") return list[0].scene;
  return JSON.stringify({ type: "classmate-boards", boards: list });
}

/** Je v tabulích něco nakresleno (pro zobrazení záložky ve čtení)? */
export const hasDrawing = (raw: string) => !!raw && parseBoards(raw).some((b) => b.scene);
