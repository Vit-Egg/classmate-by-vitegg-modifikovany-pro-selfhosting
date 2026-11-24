import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireUser } from "@/lib/session";
import { evaluate, earnedPoints, levelOf, MAX_POINTS, type Item } from "@/lib/achievements";
import { CATEGORIES, TIER_NAME, iconOf, points, LEVELS, type Category } from "@/lib/achievements-defs";
import { fmtDate } from "@/lib/dates";
import { AchBurst } from "@/components/AchBurst";
import { redirect } from "next/navigation";

export const metadata = { title: "Trofeje" };
export const dynamic = "force-dynamic";

const NEW_MS = 3 * 86_400_000;
/** „dnes“, „včera“, „před 3 dny“, jinak datum. */
function when(ms: number, now: number) {
  const d = Math.floor((now - ms) / 86_400_000);
  return d < 1 ? "dnes" : d === 1 ? "včera" : d < 7 ? `před ${d} dny` : fmtDate(ms);
}
const cs = (n: number) => n.toLocaleString("cs-CZ");

const R = 19;
const C = 2 * Math.PI * R;

/** Kruhový ukazatel kolem ikony: u nesplněné ukazuje postup, u získané je celý. */
function Tile({ icon, frac, got, cat, tier }: { icon: string; frac: number; got: boolean; cat: Category; tier?: number }) {
  return (
    <div className={`ach-ring hue-${cat}${got ? " on" : ""}${got && tier && tier >= 4 ? " big" : ""}`}>
      <svg className="rg" viewBox="0 0 44 44" aria-hidden>
        <circle className="trk" cx="22" cy="22" r={R} />
        <circle className="bar" cx="22" cy="22" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - (got ? 1 : Math.min(1, Math.max(0, frac))))} />
      </svg>
      <Icon name={icon} size={18} />
    </div>
  );
}

const fracOf = (i: Item) => (i.unlockedAt ? 1 : i.meter.frac ?? Math.max(0, Math.min(1, i.meter.cur / i.meter.goal)));

function Row({ it, now }: { it: Item; now: number }) {
  const { a, meter, unlockedAt } = it;
  const hidden = a.secret && !unlockedAt;
  const frac = fracOf(it);
  const fresh = unlockedAt != null && now - unlockedAt < NEW_MS;
  return (
    <div className={`item ach-row${unlockedAt ? "" : " locked"}${fresh ? " fresh" : ""}`}>
      <Tile icon={hidden ? "lock" : iconOf(a)} frac={frac} got={!!unlockedAt} cat={a.cat} tier={a.tier} />
      <div className="item-main">
        <div className="item-title">{hidden ? "Tajná trofej" : a.name}{fresh && <span className="ach-new">nové</span>}{a.bad && !hidden && <span className="chip plain" style={{ marginLeft: 8 }}>Kuriozita</span>}</div>
        <p className="ach-desc">{hidden ? "Ukáže se, až ji získáš." : a.desc}</p>
        {unlockedAt && a.flavor && <p className="ach-flavor">{a.flavor}</p>}
        {!unlockedAt && !hidden && <div className="ach-prog">{meter.text ?? (meter.goal > 1 ? `${cs(Math.min(meter.cur, meter.goal))} z ${cs(meter.goal)}` : "Zatím ne")}</div>}
      </div>
      <div className="ach-side">
        <span className="ach-pips" title={`${TIER_NAME[a.tier]}, ${points(a)} bodů`} aria-label={`${TIER_NAME[a.tier]}, ${points(a)} bodů`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= a.tier ? "f" : ""} />)}</span>
        {unlockedAt ? <span title={`Získáno ${fmtDate(unlockedAt)}`}>{when(unlockedAt, now)}</span> : <span>{points(a)} b.</span>}
      </div>
    </div>
  );
}

export default async function AchievementsPage({ searchParams }: { searchParams: Promise<{ k?: string; v?: string; z?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { items } = evaluate(user);
  const now = Date.now();
  const cat = CATEGORIES.find((c) => c.id === sp.k)?.id as Category | undefined;
  const view = sp.v === "ziskane" || sp.v === "zbyva" ? sp.v : "";

  const got = items.filter((i) => i.unlockedAt);
  const pts = earnedPoints(items);
  const lvl = levelOf(pts);
  const toNext = lvl.next ? Math.max(0, Math.min(1, (pts - lvl.from) / (lvl.next.from - lvl.from))) : 1;

  const recent = [...got].sort((a, b) => b.unlockedAt! - a.unlockedAt!)[0];
  const near = items.filter((i) => (!cat || i.a.cat === cat) && !i.unlockedAt && !i.a.secret && !i.a.meta && fracOf(i) > 0 && fracOf(i) < 1 && !(i.meter.goal === 1 && i.meter.frac == null)).sort((a, b) => fracOf(b) - fracOf(a)).slice(0, 3);
  const starters = near.length ? [] : items.filter((i) => (!cat || i.a.cat === cat) && !i.unlockedAt && !i.a.secret && !i.a.meta).sort((a, b) => a.a.tier - b.a.tier).slice(0, 3);
  const nearShown = near.length ? near : starters;
  const fresh = got.filter((i) => now - i.unlockedAt! < NEW_MS).map((i) => i.a.id);
  const href = (k?: string, v?: string) => {
    const q = new URLSearchParams();
    if (k) q.set("k", k);
    if (v) q.set("v", v);
    return q.size ? `/trofeje?${q}` : "/trofeje";
  };
  const shown = (c: Category) => items.filter((i) => i.a.cat === c && (view === "ziskane" ? i.unlockedAt : view === "zbyva" ? !i.unlockedAt : true));
  const sections = CATEGORIES.filter((c) => !cat || c.id === cat).map((c) => ({ c, list: shown(c.id) })).filter((s) => s.list.length);

  return (
    <div className="wide">
      <AchBurst fresh={fresh} />
      <div className="page-head">
        <div>
          <h1 className="title">Trofeje</h1>
          <p className="subtitle">Tvoje úspěchy v Classmate. Které trofeje máš, vidíš jen ty.</p>
        </div>
        <div className="head-actions"><nav className="seg small" aria-label="Zobrazení">
          <Link href={href(cat)} aria-current={!view}>Vše</Link>
          <Link href={href(cat, "ziskane")} aria-current={view === "ziskane"}>Získané</Link>
          <Link href={href(cat, "zbyva")} aria-current={view === "zbyva"}>Zbývá</Link>
        </nav></div>
      </div>

      <section className="card ach-hero">
        <div className="ach-lvl">
          <svg viewBox="0 0 100 100" aria-hidden>
            <circle className="trk" cx="50" cy="50" r="44" />
            <circle className="bar" cx="50" cy="50" r="44" strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - toNext)} />
          </svg>
          <b>{lvl.index + 1}</b>
        </div>
        <div className="ach-hero-main">
          <div className="ach-level-name">{lvl.name}</div>
          <div className="ach-level-line">{lvl.line}</div>
          <div className="ach-stats">
            <span><b>{got.length}</b>z {items.length} trofejí</span>
            <span><b>{cs(pts)}</b>bodů</span>
            {recent && <span>Naposledy: <b>{recent.a.name}</b> · {when(recent.unlockedAt!, now)}</span>}
            <span>{lvl.next ? <>Do stupně „{lvl.next.name}“ chybí <b>{cs(lvl.next.from - pts)}</b></> : "Nejvyšší stupeň"}</span>
          </div>
        </div>
      </section>

      <div className="ach-tabs">
        <div className="mtabs" role="tablist" aria-label="Kategorie">
          <Link href={href(undefined, view)} role="tab" aria-selected={!cat} className={`mtab${!cat ? " on" : ""}`}>Vše <small>{got.length}/{items.length}</small></Link>
          {CATEGORIES.map((c) => {
            const all = items.filter((i) => i.a.cat === c.id);
            return <Link key={c.id} href={href(c.id, view)} role="tab" aria-selected={cat === c.id} className={`mtab${cat === c.id ? " on" : ""}`} title={c.hint}>{c.label} <small>{all.filter((i) => i.unlockedAt).length}/{all.length}</small></Link>;
          })}
        </div>
      </div>

      {view !== "ziskane" && nearShown.length > 0 && (
        <section className="ach-section">
          <h2 className="group-title">{near.length ? "Skoro tam" : "Od čeho začít"}</h2>
          <div className="ach-near">
            {nearShown.map((i) => (
              <div key={i.a.id} className={`ach-card hue-${i.a.cat}`}>
                <Tile icon={iconOf(i.a)} frac={fracOf(i)} got={false} cat={i.a.cat} />
                <div>
                  <b>{i.a.name}</b>
                  <span>{i.meter.text ?? `${cs(Math.min(i.meter.cur, i.meter.goal))} z ${cs(i.meter.goal)}`}</span>
                </div>
                <em>{Math.round(fracOf(i) * 100)} %</em>
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.length ? (
        sections.map(({ c, list }) => (
          <section key={c.id} className="ach-section">
            <h2 className={`ach-sec-h hue-${c.id}`}>
              <span className="ach-sec-ico"><Icon name={c.icon} size={15} /></span>
              {c.label}
              {(() => {
                const all = items.filter((i) => i.a.cat === c.id);
                const n = all.filter((i) => i.unlockedAt).length;
                return (
                  <>
                    {n === all.length && <em className="ach-done">Hotovo</em>}
                    <small>{n}/{all.length}<span className="ach-mini" aria-hidden><i style={{ width: `${(n / all.length) * 100}%` }} /></span></small>
                  </>
                );
              })()}
            </h2>
            <div className="card rows">{list.map((i) => <Row key={i.a.id} it={i} now={now} />)}</div>
          </section>
        ))
      ) : (
        <div className="empty">{view === "ziskane" ? "Zatím nic. První trofej je za rohem." : "Tady už máš všechno."}</div>
      )}
      <p className="hint">Trofeje se počítají z toho, co Classmate o tobě už ví. Odemčená ti zůstane, i kdyby se údaj později změnil. V žebříčku třídy se ukazují jen body, ne konkrétní trofeje. Jsou jen doplněk: nemají žádný vliv na známky ani na nic ve škole a nechodí o nich upozornění.</p>
    </div>
  );
}
