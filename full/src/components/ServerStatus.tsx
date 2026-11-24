import { serverStatus } from "@/lib/serverstatus";
import { fmtDateTime, plural } from "@/lib/dates";
import { syncRunning } from "@/lib/background";
import { syncBakalariNow } from "@/app/actions/admin";
import { ActionForm, Submit } from "./forms";

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const dur = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** Stav serveru ve Správě: na první pohled vidět, jestli je všechno v pořádku (místo, paměť, synchronizace, Bakaláři škol). */
export function ServerStatus() {
  const s = serverStatus();
  const lowDisk = s.diskFree != null && s.diskTotal != null && s.diskFree < Math.max(2 * 1024 ** 3, s.diskTotal * 0.1);
  const slowSync = s.sync.lastEnd != null && s.sync.durationMs > 10 * 60_000;
  const down = s.bakalari.filter((b) => b.down);
  const warns = [lowDisk && "Dochází místo na disku", slowSync && "Synchronizace na pozadí trvá dlouho", down.length > 0 && `Bakaláři neodpovídají u ${down.length} ${plural(down.length, "školy", "škol", "škol")}`].filter(Boolean) as string[];
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="group-title">Stav serveru</h2>
      {warns.length > 0 && <div className="card" style={{ padding: "12px 16px", marginBottom: 12, borderColor: "var(--danger)" }}>{warns.map((w) => <div key={w}><b style={{ color: "var(--danger)" }}>⚠</b> {w}</div>)}</div>}
      <div className="stats auto">
        <div className="card stat"><b>{s.users}</b><span>uživatelů, dnes aktivních {s.active24h}</span></div>
        <div className="card stat"><b>{s.active1h}</b><span>aktivních za poslední hodinu</span></div>
        <div className="card stat"><b>{s.joined24h}</b><span>nových za 24 hodin</span></div>
        <div className="card stat"><b>{s.streams}</b><span>otevřených spojení (společné poznámky, {s.rooms} {plural(s.rooms, "poznámka", "poznámky", "poznámek")})</span></div>
        <div className="card stat"><b>{mb(s.rss)}</b><span>paměť procesu, běží {dur(s.uptimeMs)}</span></div>
        <div className="card stat"><b>{s.diskFree != null ? mb(s.diskFree) : "?"}</b><span>volného místa na disku{s.diskTotal ? ` z ${mb(s.diskTotal)}` : ""}</span></div>
        <div className="card stat"><b>{mb(s.db)}</b><span>databáze{s.wal > 1024 ** 2 ? `, deník zápisů ${mb(s.wal)}` : ""}</span></div>
        <div className="card stat">
          <b>{s.sync.lastEnd ? `${Math.max(1, Math.round(s.sync.durationMs / 1000))} s` : "–"}</b>
          <span>{s.sync.lastEnd ? `poslední synchronizace (${fmtDateTime(s.sync.lastEnd)}): ${s.sync.users} z ${s.sync.schools} škol, přeskočeno ${s.sync.skipped}, chyb ${s.sync.failed}` : `synchronizace na pozadí zatím neproběhla, propojených je ${s.connected}`}</span>
        </div>
      </div>
      <ActionForm action={syncBakalariNow} resetOnSuccess={false}>
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Submit className="btn" pendingText="Spouštím…" disabled={syncRunning()}>{syncRunning() ? "Synchronizace právě běží…" : "Synchronizovat Bakaláře hned"}</Submit>
          <small style={{ color: "var(--muted)" }}>Automaticky se synchronizuje každých {process.env.BACKGROUND_SYNC_MINUTES ?? 5} min. Tlačítko projde všechny aktivní uživatele hned.</small>
        </div>
      </ActionForm>
      {s.bakalari.length > 0 && (
        <details className="card" style={{ marginTop: 12 }} open={down.length > 0}>
          <summary style={{ cursor: "pointer", padding: "12px 16px", fontWeight: 600 }}>Bakaláři podle škol od spuštění ({s.bakalari.length})</summary>
          <div className="rows">
            {s.bakalari.map((b) => (
              <div key={b.origin} className="kv">
                <div><strong>{b.school}</strong><small>{b.ok} povedených, {b.fail} selhání{b.lastFailAt ? `, naposledy ${fmtDateTime(b.lastFailAt)}` : ""}{b.avgMs ? `, odezva ${b.avgMs} ms` : ""}{b.waiting ? `, ve frontě ${b.waiting}` : ""}</small></div>
                <span className={`badge${b.down ? "" : " accent"}`}>{b.down ? "nedostupné" : "v pořádku"}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
