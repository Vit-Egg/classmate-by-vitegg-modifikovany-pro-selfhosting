import { PageHead, Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="wide" role="status" aria-label="Načítám rozvrh">
      <PageHead />
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <Sk w={260} h={40} r={14} />
        <Sk w={190} h={40} r={14} style={{ marginLeft: "auto" }} />
      </div>
      <div className="sk-tt" aria-hidden>
        {Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? <Sk key={i} h={40} r={12} /> : <Sk key={i} h={66} r={14} />))}
      </div>
    </div>
  );
}
