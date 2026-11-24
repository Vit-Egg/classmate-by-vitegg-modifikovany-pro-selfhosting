import { ITEM_LABEL, type LessonItem } from "@/lib/lessonitems";

/** Štítky Test, Zkoušení a Úkol u hodiny. */
export function LessonTags({ items }: { items?: LessonItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="lesson-items">
      {items.map((it, i) => <span key={i} className={`li li-${it.kind}`} title={`${ITEM_LABEL[it.kind]}: ${it.text}`}>{ITEM_LABEL[it.kind]}</span>)}
    </div>
  );
}
