import Link from "next/link";
import { siteUrl, configuredUrl } from "@/lib/site";
import { ServerStatus } from "@/components/ServerStatus";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { getAiConfig } from "@/lib/ai-config";
import { SchoolMailForm, SchoolMicrosoftForm } from "@/components/SchoolMailForms";
import { SchoolTrainingForm } from "@/components/TrainingForms";
import { updateSchool } from "@/app/actions/admin";
import { PopoverMenu } from "@/components/PopoverMenu";
import { ActionForm, Submit } from "@/components/forms";
import { all } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { instanceStatus } from "@/lib/instance";
import { requireAdmin } from "@/lib/session";
import { STARTED, versionTitle } from "@/lib/version";

export const metadata = { title: "Správa" };
export const dynamic = "force-dynamic";

type School = { id: number; name: string; bakalari_url: string | null; any_class: number; users: number; mail_kind: string | null; ms_domain: string | null; ms_enabled: number; training_enabled: number; mail_domain: string | null; mail_imap_host: string | null; mail_imap_port: number | null; mail_smtp_host: string | null; mail_smtp_port: number | null };

const Popover = PopoverMenu;

export default async function AdminPage() {
  const me = await requireAdmin();
  const schools = all<School>("SELECT s.id, s.name, s.bakalari_url, s.any_class, s.mail_kind, s.ms_domain, s.ms_enabled, s.training_enabled, s.mail_domain, s.mail_imap_host, s.mail_imap_port, s.mail_smtp_host, s.mail_smtp_port, (SELECT COUNT(*) FROM users WHERE school_id = s.id) users FROM schools s WHERE s.demo = 0 ORDER BY s.id");
  const classes = all<{ id: number; name: string }>("SELECT id, name FROM classes ORDER BY id");
  const ai = getAiConfig();

  const s = schools[0];
  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Správa</h1>
          <p className="subtitle">Tvůj vlastní server · {versionTitle()} · běží od {fmtDateTime(STARTED)}</p>
        </div>
        <div className="btn-row">
        <Link href="/sprava/statistiky" className="btn">Statistiky</Link>
        <Link href="/sprava/audit" className="btn">Audit log</Link>
        <Link href="/widgety" className="btn">Widgety</Link>
        </div>
      </div>

      <ServerStatus />

      <section style={{ marginBottom: 28 }}>
        <h2 className="group-title">Server</h2>
        <div className="card rows">
          <div className="kv"><div><small>Adresa</small><strong>{configuredUrl() ?? "nenastaveno"}</strong></div><div><small>Účet</small><strong>{me.name}</strong></div></div>
          {instanceStatus().map((i) => (
            <div key={i.label} className="kv">
              <div><strong>{i.label}</strong><small>{i.hint}</small></div>
              <span className={`badge${i.ok ? " accent" : ""}`}>{i.ok ? "zapnuto" : "vypnuto"}</span>
            </div>
          ))}
        </div>
        <p className="hint" style={{ margin: "10px 4px 0" }}>Tahle verze je pro jednoho člověka: jeden účet, žádná registrace ani spolužáci. Nastavení serveru se mění v <code>.env</code>.</p>
      </section>

      <section className="hr-section" style={{ marginTop: 32 }}>
        <h2 className="group-title" style={{ marginBottom: 18 }}>Umělá inteligence</h2>
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <AiSettingsForm key={ai.models.map((m) => m.name).join("|") + ai.keys.map((k) => k.id + k.note).join("|")} models={ai.models} keys={ai.keys.map((k) => ({ id: k.id, last4: k.last4, note: k.note }))} />
        </div>
      </section>

      {s && (
        <section className="hr-section" style={{ marginTop: 32 }}>
          <h2 className="group-title" style={{ marginBottom: 18 }}>Škola</h2>
          <div className="btn-row" style={{ justifyContent: "space-between", padding: "0 4px" }}>
            <h3 className="section" style={{ fontSize: 20 }}>{s.name}</h3>
            <div className="btn-row">
              <Popover label="Upravit">
                <ActionForm action={updateSchool}>
                  <input type="hidden" name="id" value={s.id} />
                  <label className="field"><span>Název</span><input className="input" name="name" defaultValue={s.name} required /></label>
                  <label className="field"><span>Adresa Bakalářů</span><input className="input" name="url" defaultValue={s.bakalari_url ?? ""} /></label>
                  <Submit>Uložit</Submit>
                </ActionForm>
              </Popover>
              <Popover label="Pošta">
                <SchoolMailForm id={s.id} msEnabled={!!s.ms_enabled && !!s.ms_domain} d={{ kind: s.mail_kind ?? "", domain: s.mail_domain ?? "", imapHost: s.mail_imap_host ?? "", imapPort: s.mail_imap_port ? String(s.mail_imap_port) : "", smtpHost: s.mail_smtp_host ?? "", smtpPort: s.mail_smtp_port ? String(s.mail_smtp_port) : "" }} />
              </Popover>
              <Popover label="Microsoft 365">
                <SchoolMicrosoftForm id={s.id} enabled={!!s.ms_enabled} domain={s.ms_domain ?? ""} clientId={process.env.MS_CLIENT_ID?.trim() ?? ""} redirectUri={siteUrl() ? `${siteUrl()}/komunikace/pripojit/microsoft/callback` : ""} />
              </Popover>
              <Popover label="Moduly">
                <SchoolTrainingForm schoolId={s.id} enabled={!!s.training_enabled} />
              </Popover>
            </div>
          </div>
          <p className="hint" style={{ margin: "0 4px" }}>Bakaláři: {s.bakalari_url ?? "nenastaveno"} · třída {classes[0]?.name ?? ""}. Svůj účet do Bakalářů a Strava.cz propojíš v Nastavení → Propojení.</p>
        </section>
      )}
    </div>
  );
}
