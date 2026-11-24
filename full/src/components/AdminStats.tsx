"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bar, StatsData } from "@/lib/adminstats";
import { bytes, czk, dec, dur, hours, num, pct } from "@/lib/statfmt";

const TABS = [
  ["prehled", "Přehled"],
  ["pouzivani", "Používání"],
  ["uloziste", "Úložiště"],
  ["obsah", "Obsah a AI"],
  ["zarizeni", "Zařízení"],
  ["funkce", "Funkce"],
  ["penize", "Peníze"],
  ["system", "Systém"],
] as const;
type Tab = (typeof TABS)[number][0];
const PALETTE = ["var(--accent)", "#8b6cf0", "#f0a23b", "#4aa3e8", "#e8604a", "#5ac8a8", "#c46ad8", "#9aa3ad"];

/* ---------- Stavební kameny ---------- */

function Seg<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="sx-seg" role="tablist" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="tab" aria-selected={v === value} className={v === value ? "on" : undefined} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function Card({ title, note, right, children, span }: { title: string; note?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; span?: 2 | 3 }) {
  return (
    <section className={`card sx-card${span ? ` span${span}` : ""}`}>
      <header>
        <div><h3>{title}</h3>{note && <p>{note}</p>}</div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Tile({ value, label, sub, tone }: { value: React.ReactNode; label: string; sub?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`card sx-tile${tone ? ` ${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Svislé sloupce: najetí (nebo dotyk) ukáže hodnotu dne. */
function Columns({ items, fmt = num, color, every }: { items: Bar[]; fmt?: (v: number) => string; color?: string; every?: number }) {
  const [hov, setHov] = useState<number | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const step = every ?? Math.max(1, Math.ceil(items.length / 8));
  const cur = hov != null ? items[hov] : null;
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!items.length) return <p className="sx-empty">Zatím žádná data.</p>;
  return (
    <div className="sx-cols-wrap" onPointerLeave={() => setHov(null)}>
      <div className="sx-read" aria-live="polite">{cur ? <><b>{fmt(cur.value)}</b> <span>{cur.label}</span></> : <><b>{fmt(total)}</b> <span>celkem v zobrazeném období</span></>}</div>
      <div className="sx-cols" style={color ? ({ ["--bar" as string]: color }) : undefined}>
        {items.map((i, k) => (
          <button key={k} type="button" className={`sx-col${hov === k ? " hot" : ""}`} aria-label={`${i.label}: ${fmt(i.value)}`} onPointerEnter={() => setHov(k)} onFocus={() => setHov(k)} onPointerDown={() => setHov(k)}>
            <i style={{ height: `${Math.max(i.value ? 3 : 0, (i.value / max) * 100)}%` }} />
            <small>{k % step === 0 ? i.label : ""}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Vodorovné pruhy; `hint` se ukáže vpravo pod hodnotou. */
function HBars({ items, fmt = num, color, empty = "Zatím žádná data." }: { items: Bar[]; fmt?: (v: number) => string; color?: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => !i.value)) return <p className="sx-empty">{empty}</p>;
  return (
    <ul className="sx-hbars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="sx-hl" title={i.label}>{i.label}</span>
          <span className="sx-ht"><i style={{ width: `${(i.value / max) * 100}%`, background: color }} /></span>
          <span className="sx-hv">{fmt(i.value)}{i.hint && <small>{i.hint}</small>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Prstenec s legendou: najetí na část nebo na řádek je propojené, klepnutím na řádek jde část skrýt. */
function Donut({ items, fmt = num, center }: { items: Bar[]; fmt?: (v: number) => string; center?: string }) {
  const [hov, setHov] = useState<number | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const live = items.map((i, k) => (off.has(k) ? 0 : i.value));
  const total = live.reduce((a, v) => a + v, 0);
  const all = items.reduce((a, i) => a + i.value, 0);
  if (!all) return <p className="sx-empty">Zatím žádná data.</p>;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  const cur = hov != null ? items[hov] : null;
  return (
    <div className="sx-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label="Podíly">
        <g transform="rotate(-90 100 100)">
          {items.map((i, k) => {
            const len = total ? (live[k] / total) * C : 0;
            const el = (
              <circle key={k} cx="100" cy="100" r={R} fill="none" strokeWidth={hov === k ? 30 : 24} stroke={PALETTE[k % PALETTE.length]} strokeDasharray={`${Math.max(0, len - (len > 3 ? 1.5 : 0))} ${C}`} strokeDashoffset={-acc} onPointerEnter={() => setHov(k)} onPointerLeave={() => setHov(null)} style={{ transition: "stroke-width .15s, stroke-dasharray .3s", cursor: "pointer" }} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="100" y="98" textAnchor="middle" className="sx-dc-v">{cur ? fmt(cur.value) : fmt(total)}</text>
        <text x="100" y="118" textAnchor="middle" className="sx-dc-l">{cur ? `${cur.label}${total ? ` · ${pct(off.has(hov!) ? 0 : cur.value, total)}` : ""}` : center ?? "celkem"}</text>
      </svg>
      <ul className="sx-legend">
        {items.map((i, k) => (
          <li key={i.label} className={`${hov === k ? "hot" : ""}${off.has(k) ? " off" : ""}`} onPointerEnter={() => setHov(k)} onPointerLeave={() => setHov(null)}>
            <button type="button" aria-pressed={!off.has(k)} onClick={() => setOff((o) => { const x = new Set(o); x.has(k) ? x.delete(k) : x.add(k); return x; })}>
              <i style={{ background: PALETTE[k % PALETTE.length] }} />
              <span>{i.label}</span>
              <b>{fmt(i.value)}</b>
              <em>{pct(off.has(k) ? 0 : i.value, total || 1)}</em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tepelná mapa dny × hodiny. */
function Heat({ heat }: { heat: number[][] }) {
  const [hov, setHov] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...heat.flat());
  const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  const FULL = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
  const v = hov ? heat[hov.d][hov.h] : null;
  return (
    <div className="sx-heat-wrap" onPointerLeave={() => setHov(null)}>
      <div className="sx-read" aria-live="polite">{hov ? <><b>{num(v!)}</b> <span>{FULL[hov.d]} {hov.h}:00–{hov.h + 1}:00</span></> : <span>Najeď na políčko, ukáže se přesný počet.</span>}</div>
      <div className="sx-heat">
        <div className="sx-heat-h"><span />{Array.from({ length: 24 }, (_, h) => <small key={h}>{h % 3 === 0 ? h : ""}</small>)}</div>
        {heat.map((row, d) => (
          <div key={d} className="sx-heat-r">
            <small>{DAYS[d]}</small>
            {row.map((c, h) => (
              <button key={h} type="button" aria-label={`${FULL[d]} ${h}:00, ${c}`} className={hov?.d === d && hov.h === h ? "hot" : undefined} style={{ ["--a" as string]: c / max }} onPointerEnter={() => setHov({ d, h })} onFocus={() => setHov({ d, h })} onPointerDown={() => setHov({ d, h })} />
            ))}
          </div>
        ))}
      </div>
      <div className="sx-heat-leg"><span>méně</span><i /><span>více</span></div>
    </div>
  );
}

function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const R = 34, C = 2 * Math.PI * R;
  const f = total ? Math.min(1, value / total) : 0;
  return (
    <svg className="sx-ring" viewBox="0 0 84 84" role="img" aria-label={`${label}: ${pct(value, total)}`}>
      <circle cx="42" cy="42" r={R} fill="none" strokeWidth="9" className="bg" />
      <circle cx="42" cy="42" r={R} fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${f * C} ${C}`} transform="rotate(-90 42 42)" className="fg" />
      <text x="42" y="47" textAnchor="middle">{pct(value, total)}</text>
    </svg>
  );
}

const Empty = () => <p className="sx-empty">Tahle část se nepodařila načíst, podrobnosti jsou v logu serveru.</p>;

/* ---------- Stránka ---------- */

export function AdminStats({ s }: { s: StatsData }) {
  const [tab, setTab] = useState<Tab>("prehled");
  const [range, setRange] = useState<7 | 30 | 60>(30);
  const [group, setGroup] = useState<string>("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some(([id]) => id === h)) setTab(h);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try { history.replaceState(null, "", `#${t}`); } catch {}
  };

  const p = s.people;
  const feats = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return s.features.filter((f) => (!group || f.group === group) && (!ql || f.label.toLowerCase().includes(ql))).sort((a, b) => b.value - a.value);
  }, [s.features, group, q]);
  const groups = [...new Set(s.features.map((f) => f.group))];

  return (
    <div className="sx">
      <div className="sx-tabs" role="tablist" aria-label="Sekce statistik">
        {TABS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => go(id)}>{l}</button>
        ))}
      </div>

      {tab === "prehled" && (p ? (
        <>
          <div className="sx-tiles">
            <Tile value={num(p.total)} label="registrovaných" sub={`${p.schools} škol · ${p.classes} tříd`} />
            <Tile value={num(p.now)} label="právě v aplikaci" sub="aktivní za poslední hodinu" />
            <Tile value={num(p.neverOpened)} label="po registraci neotevřeli" sub={pct(p.neverOpened, p.total)} />
            <Tile value={num(p.placeholders)} label="čeká na registraci" sub="jména ve seznamech tříd" />
          </div>

          <div className="sx-two">
            <Card title="Kdo byl v aplikaci" note="Podle posledního otevření aplikace">
              <ul className="sx-win">
                {([["24 hodin", p.active.d1], ["7 dní", p.active.d7], ["30 dní", p.active.d30]] as [string, number][]).map(([l, v]) => (
                  <li key={l}>
                    <Ring value={v} total={p.total} label={l} />
                    <div><b>{num(v)}</b><span>za posledních {l}</span><small>{pct(v, p.total)} registrovaných</small></div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Kolik se jich zaregistrovalo" note="Nové účty za období">
              <ul className="sx-win">
                {([["24 hodin", p.joined.d1], ["7 dní", p.joined.d7], ["30 dní", p.joined.d30]] as [string, number][]).map(([l, v]) => (
                  <li key={l}>
                    <div className="sx-plus">+{num(v)}</div>
                    <div><b>{num(v)}</b><span>za posledních {l}</span><small>{p.total ? `${dec((v / p.total) * 100, 1)} % z celku` : ""}</small></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="sx-range"><Seg label="Období grafů" value={range} onChange={setRange} options={[[7, "7 dní"], [30, "30 dní"], [60, "60 dní"]]} /></div>
          <div className="sx-two">
            <Card title="Aktivní lidé po dnech" note={s.dau.since ? `Měří se od ${s.dau.since.split("-").reverse().map(Number).join(". ")}` : "Začne se měřit od nasazení téhle verze"}>
              <Columns items={s.dau.days.slice(-range)} />
            </Card>
            <Card title="Nové registrace po dnech" note={range > 30 ? "Zobrazeno nejvýš posledních 30 dní" : undefined}>
              <Columns items={s.growth.registrations.slice(-Math.min(range, 30))} color="#8b6cf0" />
            </Card>
          </div>
          <Card title="Celkem uživatelů po týdnech" note="Posledních 12 týdnů" span={2}>
            <Columns items={s.growth.cumulative} every={1} />
          </Card>
        </>
      ) : <Empty />)}

      {tab === "pouzivani" && (
        <>
          <div className="sx-tiles">
            <Tile value={s.usage.peak ? `${s.usage.peak.day.slice(0, 2)} ${s.usage.peak.hour}:00` : "–"} label="nejrušnější hodina" sub={s.usage.peak ? `${s.usage.peak.day}, ${num(s.usage.peak.value)} aktivit` : undefined} />
            <Tile value={(() => { const b = [...s.usage.byDay].sort((a, c) => c.value - a.value)[0]; return b?.value ? b.label : "–"; })()} label="nejrušnější den" />
            <Tile value={(() => { const b = [...s.usage.byHour].sort((a, c) => c.value - a.value)[0]; return b?.value ? b.label : "–"; })()} label="nejrušnější hodina (všechny dny)" />
            <Tile value={num(s.usage.total)} label={s.usage.source === "measured" ? "změřených aktivit (90 dní)" : "aktivit v odhadu"} sub={s.usage.source === "measured" ? "otevření aplikace po 5 minutách" : "měření se teprve sbírá"} />
          </div>
          {s.usage.source === "estimate" && <p className="sx-note">Přesné měření (jeden záznam za každých 5 minut používání) se rozjelo s touhle verzí. Dokud se nenasbírá aspoň pár desítek záznamů, ukazuje se odhad z toho, kdy se lidé přihlásili a vytvářeli poznámky, úkoly a testy. Časy jsou v pražském čase.</p>}
          <Card title="Kdy se Classmate používá" note="Aktivita podle dne v týdnu a hodiny, posledních 90 dní" span={2}>
            <Heat heat={s.usage.heat} />
          </Card>
          <div className="sx-two">
            <Card title="Podle hodiny dne"><Columns items={s.usage.byHour.map((b) => ({ ...b, label: b.label.replace(":00", "") }))} every={3} /></Card>
            <Card title="Podle dne v týdnu"><Columns items={s.usage.byDay.map((b) => ({ ...b, label: b.label.slice(0, 2) }))} every={1} color="#f0a23b" /></Card>
          </div>
        </>
      )}

      {tab === "uloziste" && (s.storage ? (
        <>
          <div className="sx-tiles">
            <Tile value={num(s.storage.notes)} label="poznámek" sub={`${num(s.storage.shared)} sdílených · ${num(s.storage.trash)} v koši`} />
            <Tile value={num(s.storage.boards)} label="tabulí" sub="poznámky s tabulí" />
            <Tile value={num(s.storage.audio.count)} label="nahrávek" sub={`${hours(s.storage.audio.seconds)} · ${bytes(s.storage.audio.size)}`} />
            <Tile value={num(s.storage.images.count + s.storage.files.count)} label="obrázků a příloh" sub={`${num(s.storage.images.count)} obrázků · ${num(s.storage.files.count)} příloh`} />
          </div>
          <div className="sx-two">
            <Card title="Z čeho se skládá úložiště" note="Soubory uživatelů a databáze">
              <Donut fmt={bytes} center="celkem" items={[
                { label: "Nahrávky", value: s.storage.audio.size },
                { label: "Obrázky", value: s.storage.images.size },
                { label: "Přílohy", value: s.storage.files.size },
                { label: "Databáze", value: s.storage.db + s.storage.wal },
              ]} />
            </Card>
            <Card title="Disk" note={s.storage.diskTotal ? `Celkem ${bytes(s.storage.diskTotal)}` : undefined}>
              {s.storage.diskTotal && s.storage.diskFree != null ? (
                <>
                  <div className="sx-disk"><i style={{ width: `${((s.storage.diskTotal - s.storage.diskFree) / s.storage.diskTotal) * 100}%` }} /></div>
                  <p className="sx-disk-t"><b>{bytes(s.storage.diskTotal - s.storage.diskFree)}</b> obsazeno · <b>{bytes(s.storage.diskFree)}</b> volných ({pct(s.storage.diskFree, s.storage.diskTotal)})</p>
                </>
              ) : <p className="sx-empty">Velikost disku není k dispozici.</p>}
              <ul className="sx-kv">
                <li><span>Databáze</span><b>{bytes(s.storage.db)}</b></li>
                <li><span>Deník zápisů (WAL)</span><b>{bytes(s.storage.wal)}</b></li>
                <li><span>Verzí poznámek</span><b>{num(s.storage.versions)}</b></li>
                <li><span>Společně upravovaných poznámek</span><b>{num(s.storage.collab)}</b></li>
                <li><span>Znaků v poznámkách</span><b>{num(s.storage.chars)}</b></li>
                <li><span>Uživatelů, kteří nahrávají</span><b>{num(s.storage.audio.users)}</b></li>
                <li><span>Souborů na uživatele (průměr)</span><b>{p?.total ? bytes((s.storage.audio.size + s.storage.images.size + s.storage.files.size) / p.total) : "–"}</b></li>
              </ul>
            </Card>
          </div>
        </>
      ) : <Empty />)}

      {tab === "obsah" && (s.content ? (
        <>
          <div className="sx-tiles">
            <Tile value={num(s.content.tasks.total)} label="úkolů" sub={`${num(s.content.tasks.upcoming)} nadcházejících · ${num(s.content.tasks.done)} odškrtnutých`} />
            <Tile value={num(s.content.tests.total)} label="testů a zkoušení" sub={`${num(s.content.tests.upcoming)} nadcházejících`} />
            <Tile value={num(s.content.ai.sets + s.content.ai.summaries)} label="generací AI celkem" sub={`${num(s.content.ai.sets)} studijních sad · ${num(s.content.ai.summaries)} shrnutí`} />
            <Tile value={num(s.content.events)} label="vlastních událostí" sub="v kalendářích" />
          </div>
          <div className="sx-two">
            <Card title="Nové úkoly po dnech" note="Posledních 30 dní"><Columns items={s.content.tasksPerDay} color="#4aa3e8" /></Card>
            <Card title="Generace AI po dnech" note="Měří se od nasazení téhle verze, chyby se nepočítají"><Columns items={s.content.ai.perDay} color="#c46ad8" /></Card>
          </div>
          <div className="sx-two">
            <Card title="Úkoly a testy podrobně">
              <ul className="sx-kv">
                <li><span>Soukromých úkolů</span><b>{num(s.content.tasks.private)}</b></li>
                <li><span>Ústních zkoušení</span><b>{num(s.content.tests.oral)}</b></li>
                <li><span>Opravných termínů</span><b>{num(s.content.tests.makeup)}</b></li>
              </ul>
            </Card>
            <Card title="Generace AI podle druhu" note="Za 24 hodin, 7 dní, 30 dní a celkem od začátku měření">
              {s.content.ai.measured.length ? (
                <table className="sx-table">
                  <thead><tr><th /><th>24 h</th><th>7 d</th><th>30 d</th><th>Celkem</th></tr></thead>
                  <tbody>{s.content.ai.measured.map((r) => <tr key={r.label}><td>{r.label}</td><td>{num(r.d1)}</td><td>{num(r.d7)}</td><td>{num(r.d30)}</td><td>{num(r.total)}</td></tr>)}</tbody>
                </table>
              ) : <p className="sx-empty">Zatím se nic nevygenerovalo (nebo se měření teprve rozjíždí).</p>}
            </Card>
          </div>
        </>
      ) : <Empty />)}

      {tab === "zarizeni" && (s.devices ? (
        <>
          <div className="sx-tiles">
            <Tile value={num(s.devices.total)} label="aktivních přihlášení" sub={`${dec(s.devices.perUser)} na uživatele`} />
            <Tile value={num(s.devices.appPlatforms.reduce((a, b) => a + b.value, 0))} label="zařízení s aplikací" />
            <Tile value={num(s.devices.pushBrowsers.reduce((a, b) => a + b.value, 0))} label="prohlížečů s upozorněními" />
          </div>
          <div className="sx-grid">
            <Card title="Typ zařízení"><Donut items={s.devices.kinds} /></Card>
            <Card title="Operační systém"><Donut items={s.devices.os} /></Card>
            <Card title="Prohlížeč"><Donut items={s.devices.browsers} /></Card>
            <Card title="Mobilní aplikace: platforma"><HBars items={s.devices.appPlatforms} empty="Zatím žádné zařízení s aplikací." /></Card>
            <Card title="Mobilní aplikace: verze"><HBars items={s.devices.appVersions} empty="Zatím žádné zařízení s aplikací." /></Card>
            <Card title="Upozornění: prohlížeče"><HBars items={s.devices.pushBrowsers} empty="Nikdo zatím nemá zapnutá upozornění." /></Card>
          </div>
        </>
      ) : <Empty />)}

      {tab === "funkce" && (
        <Card title="Využití funkcí" note={`Podíl z ${num(p?.total ?? 0)} registrovaných`} span={3}
          right={<input className="input sx-search" type="search" placeholder="Hledat funkci" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat funkci" />}>
          <div className="sx-chips">
            <button type="button" className={!group ? "on" : undefined} onClick={() => setGroup("")}>Vše</button>
            {groups.map((g) => <button key={g} type="button" className={group === g ? "on" : undefined} onClick={() => setGroup(g === group ? "" : g)}>{g}</button>)}
          </div>
          {feats.length ? (
            <ul className="sx-feat">
              {feats.map((f) => (
                <li key={f.label}>
                  <span className="sx-hl">{f.label}<em>{f.group}</em></span>
                  <span className="sx-ht"><i style={{ width: `${f.share * 100}%` }} /></span>
                  <span className="sx-hv">{pct(f.value, p?.total ?? 0)}<small>{num(f.value)} lidí</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="sx-empty">Nic nenalezeno.</p>}
        </Card>
      )}

      {tab === "penize" && (s.money ? (
        <>
          <div className="sx-tiles">
            <Tile value={czk(s.money.paidTotal)} label="vybráno celkem" sub={`${num(s.money.paidCount)} zaplacených plateb`} />
            <Tile value={czk(s.money.unpaidTotal)} label="čeká na zaplacení" sub={`${num(s.money.unpaidCount)} plateb v otevřených výběrech${s.money.claims ? ` · ${s.money.claims} hlášených` : ""}`} />
            <Tile value={num(s.money.requests)} label="výběrů peněz" sub={`${num(s.money.open)} otevřených · ${num(s.money.classesCash)} tříd s pokladnou`} />
            <Tile value={num(s.money.dutyWeeks)} label="týdnů služeb" sub={`${num(s.money.dutyClasses)} tříd`} />
          </div>
          <div className="sx-two">
            <Card title="Způsoby plateb" note="Podle počtu zaplacených plateb">
              <Donut items={s.money.methods.map((m) => ({ label: m.label, value: m.count }))} center="plateb" />
            </Card>
            <Card title="Vybrané částky podle způsobu">
              <HBars items={s.money.methods.map((m) => ({ label: m.label, value: m.amount, hint: `${num(m.count)} plateb` }))} fmt={czk} empty="Zatím nic nevybráno." />
            </Card>
          </div>
          <Card title="Vybráno po měsících" note="Posledních 12 měsíců, v korunách" span={2}>
            <Columns items={s.money.months} fmt={czk} every={1} color="#5ac8a8" />
          </Card>
        </>
      ) : <Empty />)}

      {tab === "system" && (s.system ? (
        <>
          <div className="sx-tiles">
            <Tile value={bytes(s.system.db)} label="databáze" sub={`deník zápisů ${bytes(s.system.wal)} · ${s.system.migrations} migrací`} />
            <Tile value={bytes(s.system.rss)} label="paměť procesu" sub={`halda ${bytes(s.system.heap)} · Node ${s.system.node}`} />
            <Tile value={dur(s.system.uptimeMs)} label="běží od posledního startu" />
            <Tile value={s.system.diskFree != null ? bytes(s.system.diskFree) : "?"} label="volného místa" sub={s.system.diskTotal ? `z ${bytes(s.system.diskTotal)}` : undefined} />
          </div>
          <div className="sx-two">
            <Card title="Bakaláři a synchronizace">
              <ul className="sx-kv">
                <li><span>Škol s Bakaláři od startu</span><b>{num(s.system.bakalari.schools)}</b></li>
                <li><span>Právě nedostupných</span><b>{num(s.system.bakalari.down)}</b></li>
                <li><span>Povedených / selhaných požadavků</span><b>{num(s.system.bakalari.ok)} / {num(s.system.bakalari.fail)}</b></li>
                <li><span>Poslední synchronizace</span><b>{s.system.sync.lastEnd ? `${Math.max(1, Math.round(s.system.sync.durationMs / 1000))} s, ${s.system.sync.users} uživatelů, ${s.system.sync.failed} chyb` : "zatím neproběhla"}</b></li>
              </ul>
            </Card>
            <Card title="Zprávy a provoz">
              <ul className="sx-kv">
                <li><span>Zpráv ve zvonečku</span><b>{num(s.system.messages.total)} ({pct(s.system.messages.read, s.system.messages.total)} přečteno)</b></li>
                <li><span>Odesláno e-mailem / upozorněním</span><b>{num(s.system.messages.emailed)} / {num(s.system.messages.pushed)}</b></li>
                <li><span>Zprávy „Mám nápad“</span><b>{num(s.system.inquiries.total)} ({num(s.system.inquiries.open)} nevyřízených)</b></li>
                <li><span>Záznamů v audit logu</span><b>{num(s.system.audit)}</b></li>
                <li><span>Běžících dem</span><b>{num(s.system.demos)}</b></li>
                <li><span>Klientů MCP / OAuth</span><b>{num(s.system.oauthClients)}</b></li>
              </ul>
            </Card>
          </div>
          <div className="sx-two">
            <Card title="Největší tabulky" note="Počet řádků"><HBars items={s.system.rowCounts} /></Card>
            <Card title="Nejčastější akce v audit logu"><HBars items={s.system.auditActions} empty="Audit log je zatím prázdný." /></Card>
          </div>
        </>
      ) : <Empty />)}
    </div>
  );
}
