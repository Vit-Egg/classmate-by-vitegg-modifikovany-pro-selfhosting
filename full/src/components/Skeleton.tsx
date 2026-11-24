/** Kostry stránek, které se ukážou, než dorazí data. Tvarem odpovídají skutečnému obsahu, aby nic neskákalo. */
export const Sk = ({ w, h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) => (
  <span className="sk" style={{ width: w ?? "100%", height: h, borderRadius: r, ...style }} />
);

export function PageHead({ sub = true }: { sub?: boolean }) {
  return (
    <div className="page-head" aria-hidden>
      <div style={{ display: "grid", gap: 10 }}>
        <Sk w={190} h={34} r={10} />
        {sub && <Sk w={260} h={13} />}
      </div>
    </div>
  );
}

export function ListRows({ n = 5, badge = false }: { n?: number; badge?: boolean }) {
  return (
    <div className="card rows" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="item">
          {badge ? <Sk w={44} h={44} r={12} /> : <Sk w={24} h={24} r={8} />}
          <div className="item-main" style={{ display: "grid", gap: 8 }}>
            <Sk w={`${55 + ((i * 17) % 35)}%`} h={15} />
            <Sk w={`${25 + ((i * 11) % 25)}%`} h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
