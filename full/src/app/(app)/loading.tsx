import { ListRows, PageHead } from "@/components/Skeleton";

/** Výchozí kostra pro všechny stránky aplikace, než se načtou data. */
export default function Loading() {
  return (
    <div className="wide" role="status" aria-label="Načítám">
      <PageHead />
      <ListRows n={6} />
    </div>
  );
}
