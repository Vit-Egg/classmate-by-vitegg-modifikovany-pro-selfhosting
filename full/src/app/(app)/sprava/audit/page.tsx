import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { LiveSearch } from "@/components/LiveSearch";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES, auditCount, listAudit, retentionDays, type AuditAction, type AuditCategory } from "@/lib/audit";
import { fmtDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const CATS = new Set<string>(AUDIT_CATEGORIES.map((c) => c.id));

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; k?: string; a?: string; u?: string; pred?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const cat = CATS.has(sp.k ?? "") ? (sp.k as AuditCategory) : "";
  const user = Number(sp.u) > 0 ? Number(sp.u) : undefined;
  const before = Number(sp.pred) > 0 ? Number(sp.pred) : undefined;
  const { rows, more } = listAudit({ q: sp.q, cat, action: sp.a, user, before }, 50);
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: sp.q, k: sp.k, a: sp.a, u: sp.u })) if (v) keep.set(k, v);
  const older = more ? (() => { const n = new URLSearchParams(keep); n.set("pred", String(rows[rows.length - 1].id)); return `/sprava/audit?${n}`; })() : null;
  const actions = (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((a) => !cat || AUDIT_ACTIONS[a].cat === cat);

  return (
    <div className="wide">
      <p className="back"><Link href="/sprava" className="link-u">← Správa</Link></p>
      <div className="page-head">
        <div>
          <h1 className="title">Audit log</h1>
          <p className="subtitle">Kdo, kdy a co udělal ve správě a u zabezpečení účtů · {auditCount()} záznamů, drží se {retentionDays()} dní</p>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}><LiveSearch initial={sp.q ?? ""} placeholder="Hledat podle jména, popisu nebo IP adresy…" label="Hledat v audit logu" /></div>
      <FilterBar
        filters={[
          { param: "k", label: "Druh", options: AUDIT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })) },
          { param: "a", label: "Událost", options: actions.map((a) => ({ value: a, label: AUDIT_ACTIONS[a].label })) },
        ]}
      />
      {user && <p className="hint" style={{ margin: "10px 4px 0" }}>Jen události, které se týkají účtu č. {user}. <Link href="/sprava/audit" className="link-u">Zrušit</Link></p>}
      {!rows.length && <div className="empty">Nic takového tu zatím není.</div>}
      {rows.length > 0 && (
        <div className="card rows audit-rows" style={{ marginTop: 14 }}>
          {rows.map((r) => {
            const def = AUDIT_ACTIONS[r.action as AuditAction];
            const danger = r.action === "login_failed" || r.action === "login_2fa_failed";
            return (
              <div key={r.id} className="audit-row">
                <time className="audit-when" dateTime={new Date(r.at).toISOString()}>{fmtDateTime(r.at)}</time>
                <div className="audit-main">
                  <div>
                    <span className={`chip${danger ? " danger" : ""}`}>{def?.label ?? r.action}</span>
                    {r.actor_name && (r.actor_id ? <Link href={`/sprava/audit?u=${r.actor_id}`} className="audit-who">{r.actor_name}</Link> : <span className="audit-who">{r.actor_name}</span>)}
                    {!r.actor_name && r.actor_id == null && <span className="audit-who muted">nepřihlášený</span>}
                    {r.target && <span className="audit-target">→ {r.target_user_id ? <Link href={`/sprava/audit?u=${r.target_user_id}`}>{r.target}</Link> : r.target}</span>}
                  </div>
                  {(r.detail || r.ip) && (
                    <div className="audit-meta">
                      {r.detail && <span>{r.detail}</span>}
                      {r.ip && <code title="IP adresa">{r.ip}</code>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {older && <p style={{ textAlign: "center", margin: "18px 0" }}><Link href={older} className="btn">Starší záznamy</Link></p>}
      <p className="hint" style={{ margin: "16px 4px" }}>Zapisují se přihlášení a zabezpečení účtů, zásahy správce a nahlášení obsahu. Hesla, tokeny, klíče ani obsah poznámek se nezapisují. Při smazání účtu se z jeho záznamů odstraní jméno a IP adresa.</p>
    </div>
  );
}
