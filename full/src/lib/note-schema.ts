/** Schéma textu poznámky (uzly a značky) pro server: z něj se sestaví sdílený dokument a zpět JSON. Musí odpovídat rozšířením v editoru (NoteEditor). */
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { NoteImage } from "./note-image";

let cached: ReturnType<typeof getSchema> | null = null;

export function noteSchema() {
  cached ??= getSchema([StarterKit, Highlight, TaskList, TaskItem.configure({ nested: true }), TableKit, NoteImage]);
  return cached;
}
