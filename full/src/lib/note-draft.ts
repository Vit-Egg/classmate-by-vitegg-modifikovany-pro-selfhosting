/** Záloha rozepsané poznámky v tomto prohlížeči (localStorage). Zapisuje se okamžitě při psaní a maže po úspěšném uložení na server, takže přežije výpadek sítě i zavření karty. */
export type Draft = { title: string; subject: number | null; content: string; text: string; baseRev: number; at: number };

const key = (id: number) => `note-draft:${id}`;

export function saveDraft(id: number, d: Draft) {
  try {
    localStorage.setItem(key(id), JSON.stringify(d));
  } catch {
    // plné úložiště nebo soukromé okno: záloha není, ukládání na server běží dál
  }
}

export function loadDraft(id: number): Draft | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return typeof d?.content === "string" && typeof d.text === "string" ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft(id: number) {
  try {
    localStorage.removeItem(key(id));
  } catch {}
}

const bkey = (id: number | string) => `board-draft:${id}`;
export const saveBoardDraft = (id: number | string, json: string) => {
  try {
    if (json.length < 2_500_000) localStorage.setItem(bkey(id), JSON.stringify({ json, at: Date.now() }));
  } catch {}
};
export const loadBoardDraft = (id: number | string): { json: string; at: number } | null => {
  try {
    const raw = localStorage.getItem(bkey(id));
    return raw ? (JSON.parse(raw) as { json: string; at: number }) : null;
  } catch {
    return null;
  }
};
export const clearBoardDraft = (id: number | string) => {
  try {
    localStorage.removeItem(bkey(id));
  } catch {}
};

/** Je to jen prázdný dokument (žádný text, vzorec ani obrázek)? Takovou zálohu nemá smysl nabízet k obnovení. */
export function isEmptyDoc(content: string, text: string): boolean {
  if (text.trim()) return false;
  try {
    const doc = JSON.parse(content) as { content?: { type?: string; content?: unknown[] }[] };
    return !(doc.content ?? []).some((n) => n.type !== "paragraph" || (n.content?.length ?? 0) > 0);
  } catch {
    return false;
  }
}

/** Kolik viditelných prvků má uložená scéna tabule (smazané se nepočítají). */
export function boardElements(json: string | null | undefined): unknown[] {
  if (!json) return [];
  try {
    const els = (JSON.parse(json) as { elements?: { isDeleted?: boolean }[] }).elements ?? [];
    return els.filter((e) => !e.isDeleted);
  } catch {
    return [];
  }
}
