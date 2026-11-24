export const ITEM_LABEL = { test: "Test", oral: "Zkoušení", task: "Úkol" } as const;

/** Test, zkoušení nebo úkol připojený k hodině; klíč v mapě je „datum|název předmětu“. */
export type LessonItem = { kind: "test" | "oral" | "task"; text: string };
export type LessonItems = Map<string, LessonItem[]>;
