import { PageHead, Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="wide" role="status" aria-label="Načítám kalendář">
      <PageHead />
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Sk w={230} h={36} r={12} />
        <Sk w={160} h={36} r={12} style={{ marginLeft: "auto" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[84, 92, 150, 150, 80].map((w, i) => <Sk key={i} w={w} h={34} r={999} />)}
      </div>
      <div className="sk-cal" aria-hidden>
        {Array.from({ length: 35 }, (_, i) => <Sk key={i} h={92} r={14} />)}
      </div>
    </div>
  );
}
