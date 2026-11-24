/** Kdo položku (test, úkol, událost) zadal a kdo ji naposled upravil. */
export type Credited = { created_by: number | null; author: string | null; private?: number | boolean; updated_by?: number | null; editor?: string | null };

export function credit(t: Credited, userId: number) {
  const by = t.private ? "jen pro tebe" : t.author ? (t.created_by === userId ? "od tebe" : `od ${t.author}`) : "";
  const edited = t.updated_by && t.editor ? `upraveno: ${t.updated_by === userId ? "ty" : t.editor}` : "";
  return { by, edited, text: [by, edited].filter(Boolean).join(" · ") };
}
