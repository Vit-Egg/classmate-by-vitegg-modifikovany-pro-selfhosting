import { ListRows, Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="wide" role="status" aria-label="Načítám">
      <Sk w={150} h={13} style={{ marginBottom: 14 }} />
      <Sk w="62%" h={46} r={14} style={{ marginBottom: 26 }} />
      <Sk h={54} r={18} style={{ marginBottom: 12 }} />
      <Sk h={24} r={12} style={{ marginBottom: 32 }} />
      <div className="grid-2">
        <ListRows n={5} />
        <div className="stack-lg">
          <ListRows n={3} badge />
          <ListRows n={3} />
        </div>
      </div>
    </div>
  );
}
