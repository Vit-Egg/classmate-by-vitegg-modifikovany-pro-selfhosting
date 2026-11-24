import Link from "next/link";
import { EmailNotifySetting } from "@/components/EmailNotifySetting";
import { mailConfigured } from "@/lib/mail";
import { AppInfoCard, AppNotifySettings, AppWidgets } from "@/components/AppSettings";
import { InstallApp } from "@/components/InstallApp";
import { isAppRequest } from "@/lib/app-devices";
import { ShortcutsEditor } from "@/components/ShortcutsEditor";
import { resolveKeys } from "@/lib/shortcuts";
import { NoteTitleSetting } from "@/components/NoteTitleSetting";
import { VersionInfo } from "@/components/VersionInfo";
import { SummarySetting } from "@/components/SummarySetting";
import { getPref } from "@/lib/prefs";
import { summaryEnabled } from "@/lib/summary";
import { setMarksSharing, setTimetableSharing } from "@/app/actions/settings";
import { setCategory } from "@/app/actions/messages";
import { PushToggle } from "@/components/PushToggle";
import { CATEGORIES, disabledCategories } from "@/lib/messages";
import { beginTotp, changeEmail, saveSocials, connectBakalari, disableTotp, regenerateCodes, revokeConnection, syncNow } from "@/app/actions/settings";
import { logoutAction } from "@/app/actions/auth";
import { deleteAccount } from "@/app/actions/settings";
import { PopoverMenu } from "@/components/PopoverMenu";
import { ActionForm, ConfirmButton, Submit } from "@/components/forms";
import { DownloadButton } from "@/components/DownloadButton";
import { AccentPicker } from "@/components/AccentPicker";
import { SeasonToggle } from "@/components/SeasonToggle";
import { activeSeason } from "@/lib/season";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { headers } from "next/headers";
import { all } from "@/lib/db";
import { originOf } from "@/lib/oauth";
import { fmtDate, fmtTimeSeconds } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { disconnectStrava } from "@/app/actions/obedy";
import { removeMyAvatar } from "@/app/actions/avatar";
import { endDemo } from "@/app/actions/demo";
import { AvatarBig } from "@/components/Avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { socialColor, SocialIcon } from "@/components/SocialIcon";
import { avatarVersion } from "@/lib/avatar";
import { SOCIALS, SOCIAL_GROUPS, parseSocials } from "@/lib/socials";
import { get } from "@/lib/db";
import { disconnectTodoistAction, syncTodoistNow } from "@/app/actions/todoist";
import { TodoistConnect } from "@/components/TodoistConnect";
import { PercentileSetting } from "@/components/PercentileSetting";
import { AfterSchoolSetting } from "@/components/AfterSchoolSetting";
import { todoistAccount, todoistOAuthConfigured } from "@/lib/todoist";
import { fmtDateTime } from "@/lib/dates";
import { StravaConnect } from "@/components/StravaConnect";
import { stravaAccount } from "@/lib/strava";
import { schoolTrainingEnabled, trainingActive } from "@/lib/training";
import { setTrainingAction } from "@/app/actions/denik";
import { disconnectAccount } from "@/app/actions/komunikace";
import { MailConnect } from "@/components/MailParts";
import { MAIL_ERRORS, mailAccount, microsoftConfigured, schoolMail, schoolMicrosoft } from "@/lib/mailbox";
import { remainingRecoveryCodes } from "@/lib/twofa";
import { getTimetable, userGroups, userSubjects } from "@/lib/sync";

export const metadata = { title: "Nastavení" };
export const dynamic = "force-dynamic";

function Pop({ label, children, danger }: { label: string; children: React.ReactNode; danger?: boolean }) {
  return <PopoverMenu label={label} danger={danger}>{children}</PopoverMenu>;
}

const PasswordForm = ({ action, submit }: { action: Parameters<typeof ActionForm>[0]["action"]; submit: string }) => (
  <ActionForm action={action}>
    <label className="field"><span>Pro potvrzení zadej heslo</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
    <Submit>{submit}</Submit>
  </ActionForm>
);

const GROUPS = [
  { id: "obecne", label: "Vzhled a chování", sub: "Motiv, rozložení, zkratky", color: "#5b8def", icon: "M12 3a9 9 0 1 0 0 18 3 3 0 0 0 2-5 2 2 0 0 1 2-2h2a2 2 0 0 0 2-2 9 9 0 0 0-8-9zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm4 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" },
  { id: "oznameni", label: "Oznámení", sub: "Co a jak ti má chodit", color: "#ef5b5b", icon: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.7 21a2 2 0 0 1-3.4 0" },
  { id: "skola", label: "Škola a předměty", sub: "Předměty a skupiny", color: "#34b27b", icon: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5" },
  { id: "propojeni", label: "Propojení", sub: "Bakaláři, e-mail, Strava, Todoist", color: "#f0a030", icon: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" },
  { id: "ucet", label: "Účet a zabezpečení", sub: "Heslo, ověření, export dat", color: "#8b6cf0", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { id: "aplikace", label: "O aplikaci", sub: "Verze, novinky, podpora", color: "#7b8794", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" },
];

const TODOIST_ERRORS: Record<string, string> = {
  stav: "Přihlášení přes Todoist vypršelo nebo se nezdařilo. Zkus to znovu.",
  zamitnuto: "Přístup k Todoistu jsi nepovolil(a), nic se nepropojilo.",
  nenastaveno: "Přihlášení přes Todoist server nemá nastavené. Použij API token.",
  todoist: "Todoist propojení nepotvrdil. Zkus to znovu, nebo použij API token.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ chyba?: string; k?: string; td?: string }> }) {
  const user = await requireUser();
  const socials = parseSocials(get<{ socials: string | null }>("SELECT socials FROM users WHERE id = ?", user.id)?.socials);
  const inApp = isAppRequest((await headers()).get("user-agent")); // stránku zobrazuje mobilní aplikace
  const subjects = userSubjects(user.id);
  const groups = userGroups(user.id);
  const perm = (await getTimetable(user, "permanent")).data;
  const teachers = new Map<string, string[]>();
  for (const l of perm?.lessons ?? []) {
    const name = l.teacherName || l.teacher;
    if (!name || !l.subjectId) continue;
    const list = teachers.get(l.subjectId) ?? [];
    if (!list.includes(name)) teachers.set(l.subjectId, [...list, name]);
  }
  const connected = !!user.bakalari_refresh_enc;
  const mailCfg = schoolMail(user.school_id);
  const stravaAcc = stravaAccount(user.id);
  const todoist = todoistAccount(user.id);
  const season = activeSeason();
  const msDomain = schoolMicrosoft(user.school_id);
  const msAcc = mailAccount(user.id, "microsoft");
  const imapAcc = mailAccount(user.id, "imap");
  const sp = await searchParams;
  const mailErr = MAIL_ERRORS[sp.chyba ?? ""];
  const group = GROUPS.find((g) => g.id === sp.k)?.id ?? "obecne";
  const off = disabledCategories(user);
  const mcpUrl = `${originOf(await headers())}/mcp`;
  const apps = all<{ id: number; name: string; created_at: number; last_used_at: number | null }>(
    "SELECT t.id, c.name, t.created_at, t.last_used_at FROM oauth_tokens t JOIN oauth_clients c ON c.id = t.client_id WHERE t.user_id = ? ORDER BY t.created_at DESC",
    user.id,
  );

  return (
    <div className="wide" data-set={sp.k ? "group" : "index"}>
      <div className="page-head set-head">
        <div>
          <h1 className="title">Nastavení</h1>
          <p className="subtitle">Vzhled, oznámení, propojení a účet</p>
        </div>
      </div>
      {/* telefon: nejdřív seznam kategorií jako v nastavení systému, po klepnutí detail se šipkou zpět */}
      <div className="set-index" aria-label="Kategorie nastavení">
        {GROUPS.map((g) => (
          <Link key={g.id} href={`/nastaveni?k=${g.id}`} className="set-cat">
            <span className="set-ico" style={{ background: g.color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={g.icon} /></svg></span>
            <span className="set-cat-t"><b>{g.label}</b><small>{g.sub}</small></span>
            {g.id === "propojeni" && !connected && <i className="set-dot" title="Bakaláři nejsou propojené" />}
            <span className="set-chev" aria-hidden>›</span>
          </Link>
        ))}
      </div>
      <div className="set-backbar">
        <Link href="/nastaveni" className="set-back"><span aria-hidden>‹</span> Nastavení</Link>
        <h2>{GROUPS.find((g) => g.id === group)?.label}</h2>
      </div>
      <div className="set-layout" data-view={sp.k ? "group" : "index"}>
        <nav className="set-nav" aria-label="Kategorie nastavení">
          {GROUPS.map((g) => (
            <Link key={g.id} href={`/nastaveni?k=${g.id}`} aria-current={g.id === group ? "page" : undefined}>
              {g.label}
              {g.id === "propojeni" && !connected && <i className="set-dot" title="Bakaláři nejsou propojené" />}
            </Link>
          ))}
        </nav>
        <div className="set-body">
        {group === "obecne" && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Vzhled</h2>
          <ThemeSwitch />
          <div style={{ height: 14 }} />
          <AccentPicker />
          <p className="hint">Platí jen v tomto prohlížeči.</p>
          {season && <div className="card card-pad" style={{ marginTop: 14 }}><SeasonToggle id={season.id} name={season.name} /></div>}
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Aplikace</h2>
          {inApp ? <AppInfoCard /> : <InstallApp />}
        </section>

        {inApp && (
          <section>
            <h2 className="section" style={{ marginBottom: 12 }}>Widgety na plochu</h2>
            <AppWidgets />
          </section>
        )}

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Stránka Dnes</h2>
          <div className="card rows"><AfterSchoolSetting initial={getPref(user, "after_tomorrow") !== "0"} /></div>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Poznámky</h2>
          <div className="card card-pad"><NoteTitleSetting initial={user.note_title_template ?? ""} /></div>
        </section>

        {summaryEnabled() && !user.demo && (
          <section>
            <h2 className="section" style={{ marginBottom: 12 }}>Umělá inteligence</h2>
            <div className="card rows"><SummarySetting initial={getPref(user, "ai_sum") === "1"} /></div>
          </section>
        )}

        <section id="zkratky">
          <h2 className="section" style={{ marginBottom: 12 }}>Klávesové zkratky</h2>
          <ShortcutsEditor initial={resolveKeys(user.shortcuts)} isAdmin={user.role === "admin"} />
        </section>
        </div>
        )}

        {group === "oznameni" && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Zprávy</h2>
          <div className="card rows">
            {CATEGORIES.map((c) => {
              const on = !off.includes(c.id);
              return (
                <form key={c.id} action={setCategory} className="set-row">
                  <input type="hidden" name="category" value={c.id} />
                  <div><b>{c.label}</b><small>{c.hint}</small></div>
                  <button className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={c.label}><i /></button>
                </form>
              );
            })}
          </div>
          {inApp ? (
            <div style={{ marginTop: 14 }}><AppNotifySettings /><p className="hint">V noci (22–6 h) se oznámení nezobrazují, zprávy ale najdeš ve Zprávách.</p></div>
          ) : (
            <div style={{ marginTop: 14 }}><PushToggle /><p className="hint">Upozornění jsou jen na tomto zařízení, na dalších si je zapneš zvlášť. V noci (22–6 h) se nezobrazují, zprávy ale najdeš ve Zprávách.</p></div>
          )}
        </section>

        {!user.demo && (
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>E-mailová upozornění</h2>
          <EmailNotifySetting mode={user.email_notify} confirmed={user.email_confirmed_for === user.email} email={user.email} configured={mailConfigured()} isAdmin={user.role === "admin"} />
        </section>
        )}
        </div>
        )}

        {group === "skola" && (
        <div className="masonry">
        <section>
          <h2 className="section">Předměty</h2>
          <p className="hint" style={{ margin: "4px 0 12px" }}>Předměty se berou z tvého rozvrhu. Úkoly, testy a zkoušení si přidáváš sám a vidí je celá třída.</p>
          {subjects.length ? (
            <div className="card rows">
              {subjects.map((s) => (
                <div key={s.id} className="dot-row" style={{ ["--hue" as string]: `var(--h-${s.hue})` }}>
                  <span className="dot" /> {s.name}
                  {teachers.get(s.bk_id)?.length ? <span className="teachers">{teachers.get(s.bk_id)!.join(", ")}</span> : null}
                </div>
              ))}
            </div>
          ) : <div className="empty">Předměty se načtou po synchronizaci s Bakaláři.</div>}
        </section>

        <section>
          <h2 className="section">Moje skupiny</h2>
          <p className="hint" style={{ margin: "4px 0 12px" }}>Úkol, test nebo zkoušení u předmětu rozděleného na skupiny se zadá automaticky jen pro tvou skupinu.</p>
          {groups.length ? (
            <div className="card rows">
              {groups.map((g) => (
                <div key={g.id} className="kv">
                  <div><strong>{g.label}</strong><small>{g.whole_class ? "celá třída" : g.subjects.split(",").join(", ")}</small></div>
                                  </div>
              ))}
            </div>
          ) : <div className="empty">Zatím žádné skupiny.</div>}
        </section>


        </div>
        )}

        {!!user.demo && (group === "propojeni" || group === "ucet") && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>{group === "propojeni" ? "Propojení" : "Účet a zabezpečení"}</h2>
          <div className="card card-pad demo-locked">
            <p style={{ margin: 0 }}>
              {group === "propojeni"
                ? "V demu nejde propojit Bakaláře, školní e-mail, Strava.cz, Todoist ani AI aplikace. Ve skutečném účtu ano."
                : "V demu není e-mail, heslo ani dvoufázové ověření. Je to dočasný účet s vymyšlenými daty."}
            </p>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <form action={endDemo}><input type="hidden" name="to" value="register" /><button className="btn primary">Vytvořit si účet</button></form>
              <form action={endDemo}><button className="btn">Ukončit demo</button></form>
            </div>
          </div>
        </section>
        </div>
        )}

        {!user.demo && group === "propojeni" && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Bakaláři</h2>
          {connected ? (
            <>
              <div className="card rows">
                <div className="kv"><div><small>Propojeno jako</small><strong>{user.bakalari_username}</strong></div></div>
                <div className="kv"><div><small>Poslední synchronizace</small><strong>{user.last_sync_at ? fmtTimeSeconds(user.last_sync_at) : "zatím nikdy"}</strong></div></div>
              </div>
              <p className="hint" style={{ margin: "10px 0 12px" }}>Rozvrh a jeho předměty se berou z Bakalářů a nejdou upravit. Aktualizují se samy, tady je můžeš načíst hned.</p>
              <form action={syncNow}><Submit className="btn">Synchronizovat teď</Submit></form>
            </>
          ) : (
            <div className="card card-pad">
              <p style={{ marginBottom: 14 }} className="msg-error">Bakaláři nejsou propojené nebo přihlášení vypršelo.</p>
              <ActionForm action={connectBakalari}>
                <label className="field"><span>Jméno do Bakalářů</span><input className="input" name="bkUser" defaultValue={user.bakalari_username ?? ""} autoComplete="off" required /></label>
                <label className="field"><span>Heslo do Bakalářů</span><input className="input" type="password" name="bkPass" autoComplete="off" required /></label>
                <p className="hint" style={{ marginTop: 0 }}>Heslo se neukládá, jen se jednorázově ověří.</p>
                <div><Submit pendingText="Ověřuji…">Propojit</Submit></div>
              </ActionForm>
            </div>
          )}
        </section>

        {msDomain && (
        <section id="propojeni">
          <h2 className="section" style={{ marginBottom: 12 }}>Microsoft 365</h2>
          {msAcc ? (
            <>
              <div className="card rows">
                <div className="kv"><div><small>Propojený účet</small><strong>{msAcc.address}</strong></div></div>
                <div className="kv"><div><small>Použito v</small><strong>{mailCfg?.kind === "microsoft" ? "Komunikace: Teams a školní e-mail" : "Komunikace: Teams"}</strong></div></div>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <Link href="/komunikace?t=teams" className="btn">Otevřít Teams</Link>
                <form action={disconnectAccount}><input type="hidden" name="kind" value="microsoft" /><ConfirmButton className="btn danger" message="Odpojit Microsoft 365? Teams (a školní e-mail, pokud ho máš přes Microsoft) se v aplikaci přestanou zobrazovat.">Odpojit</ConfirmButton></form>
              </div>
            </>
          ) : (
            <div className="card card-pad">
              {mailErr && <p className="msg-error" role="alert">{mailErr}</p>}
              {microsoftConfigured() ? (
                <>
                  <p style={{ margin: "0 0 14px" }}>Přihlas se školním účtem Microsoft 365 (@{msDomain}). Jedním přihlášením se propojí Teams (zadání, chaty, týmy a soubory){mailCfg?.kind === "microsoft" ? " i školní e-mail" : ""}.</p>
                  <a className="btn primary" href="/komunikace/pripojit/microsoft">Přihlásit se přes Microsoft</a>
                  <p className="hint" style={{ margin: "12px 0 0" }}>Heslo se do aplikace nedostane. Aplikace dostane jen povolení, která schvaluje správce školy.</p>
                </>
              ) : <p className="msg-error" style={{ margin: 0 }}>Připojení k Microsoftu ještě není na serveru nastavené (MS_CLIENT_ID a MS_CLIENT_SECRET).</p>}
            </div>
          )}
        </section>
        )}

        {mailCfg && (
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Školní e-mail</h2>
          {mailCfg!.kind === "microsoft" ? (
            <div className="card card-pad"><p style={{ margin: 0 }}>Školní e-mail je přes <b>Microsoft 365</b>, takže se propojí stejným přihlášením výše{msAcc ? " a už je propojený." : "."}</p></div>
          ) : imapAcc ? (
            <>
              <div className="card rows">
                <div className="kv"><div><small>Propojený účet</small><strong>{imapAcc.address}</strong></div></div>
                <div className="kv"><div><small>Typ</small><strong>IMAP / SMTP</strong></div></div>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <Link href="/komunikace?t=posta" className="btn">Otevřít e-mail</Link>
                <form action={disconnectAccount}><input type="hidden" name="kind" value="imap" /><ConfirmButton className="btn danger" message="Odpojit školní e-mail? Zprávy zůstanou ve tvé poště.">Odpojit</ConfirmButton></form>
              </div>
            </>
          ) : (
            <div className="card card-pad">
              <p style={{ margin: "0 0 14px" }}>Přihlas se do školní pošty (@{mailCfg!.domain}). Zprávy půjde číst a odpovídat na ně v Komunikaci.</p>
              <MailConnect domain={mailCfg!.domain} />
            </div>
          )}
        </section>
        )}

        <section id="strava">
          <h2 className="section" style={{ marginBottom: 12 }}>Strava.cz (obědy)</h2>
          {stravaAcc ? (
            <>
              <div className="card rows">
                <div className="kv"><div><small>Propojeno</small><strong>{stravaAcc.anon ? "jen jídelníček (bez přihlášení)" : stravaAcc.username}</strong></div></div>
                <div className="kv"><div><small>Číslo jídelny</small><strong>{stravaAcc.canteen}</strong></div></div>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <Link href="/obedy" className="btn">Otevřít Obědy</Link>
                <form action={disconnectStrava}><ConfirmButton className="btn danger" message={stravaAcc.anon ? "Odpojit Strava.cz?" : "Odpojit Strava.cz? Uložené heslo se smaže."}>Odpojit</ConfirmButton></form>
              </div>
              {stravaAcc.anon && (
                <div className="card card-pad" style={{ marginTop: 14 }}>
                  <p style={{ margin: "0 0 14px" }}>Chceš vidět kredit a objednávat obědy? Přihlas se ke Strava.cz.</p>
                  <StravaConnect upgrade canteen={stravaAcc.canteen} />
                </div>
              )}
            </>
          ) : (
            <div className="card card-pad">
              <p style={{ margin: "0 0 14px" }}>Obědy si zapínáš sám jen pro sebe. Stačí číslo jídelny a uvidíš jídelníček, nebo se přihlas stejnými údaji jako na webu jídelny a půjde i objednávat.</p>
              <StravaConnect />
            </div>
          )}
        </section>

        {schoolTrainingEnabled(user.school_id) && (
          <section id="denik">
            <h2 className="section" style={{ marginBottom: 12 }}>Tréninkový deník</h2>
            <div className="card card-pad">
              <p style={{ margin: "0 0 14px" }}>Tvoje škola povolila deník pro program Aktivní sportovec. Zapisuješ do něj tréninky a týdenní reflexe (ručně, nebo z Intervals.icu) a stáhneš si z něj tabulku, kterou škola vyžaduje.</p>
              {trainingActive(user) ? (
                <div className="btn-row">
                  <Link href="/denik" className="btn primary">Otevřít deník</Link>
                  <form action={setTrainingAction}><input type="hidden" name="enabled" value="0" /><button className="btn">Vypnout</button></form>
                </div>
              ) : (
                <form action={setTrainingAction}><input type="hidden" name="enabled" value="1" /><button className="btn primary">Zapnout tréninkový deník</button></form>
              )}
            </div>
          </section>
        )}

        <section id="todoist">
          <h2 className="section" style={{ marginBottom: 12 }}>Todoist</h2>
          {sp.td === "ok" && <p className="msg-ok" role="status" style={{ marginBottom: 12 }}>Todoist je propojený. Úkoly se začnou zapisovat.</p>}
          {sp.td && sp.td !== "ok" && <p className="msg-error" role="alert" style={{ marginBottom: 12 }}>{TODOIST_ERRORS[sp.td] ?? "Propojení s Todoistem se nepovedlo."}</p>}
          {todoist ? (
            <>
              <div className="card rows">
                <div className="kv"><div><small>Projekt v Todoistu</small><strong>{todoist.project_name}</strong></div></div>
                <div className="kv"><div><small>Přihlášení</small><strong>{todoist.auth === "oauth" ? "přes Todoist (OAuth)" : "API token"}</strong></div></div>
                <div className="kv"><div><small>Poslední synchronizace</small><strong>{todoist.last_sync_at ? fmtDateTime(todoist.last_sync_at) : "zatím neproběhla"}</strong></div></div>
              </div>
              {todoist.last_error && <p className="msg-error" role="alert" style={{ marginTop: 12 }}>{todoist.last_error}</p>}
              <p className="hint" style={{ margin: "12px 4px 0" }}>Tvoje otevřené úkoly se samy zapisují do Todoistu. Synchronizace funguje oběma směry: co odškrtneš, přejmenuješ nebo přesuneš na jiný termín v Classmate, projeví se v Todoistu, a naopak. Z Todoistu se přebere jen to, co bys mohl(a) udělat i v Classmate (úkol zadaný spolužákem jde odškrtnout, ale ne přejmenovat, přesunout ani smazat), jinak se změna vrátí zpět a dostaneš zprávu. Smazáním úkolu v Todoistu smažeš úkol i v Classmate, pokud je tvůj.</p>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <form action={syncTodoistNow}><button className="btn">Synchronizovat teď</button></form>
                <form action={disconnectTodoistAction}><ConfirmButton className="btn danger" message="Odpojit Todoist? Úkoly, které už v něm jsou, zůstanou.">Odpojit</ConfirmButton></form>
              </div>
            </>
          ) : (
            <div className="card card-pad">
              <p style={{ margin: "0 0 14px" }}>Úkoly ze třídy se ti budou samy zapisovat do Todoistu, včetně termínu a předmětu, a po odškrtnutí tady se dokončí i tam.</p>
              <TodoistConnect oauth={todoistOAuthConfigured()} />
            </div>
          )}
        </section>

        <section>
          <h2 className="section">AI aplikace</h2>
          <p className="hint" style={{ margin: "4px 0 12px" }}>
            Claude, ChatGPT a další AI se můžou připojit k tvému účtu a dělat totéž co ty (ne měnit heslo, e-mail ani zabezpečení). Při připojení se přihlásíš a přístup schválíš. Adresa MCP serveru:
          </p>
          <p className="mono" style={{ marginBottom: 12, userSelect: "all" }}>{mcpUrl}</p>
          {apps.length ? (
            <div className="card rows">
              {apps.map((a) => (
                <div key={a.id} className="kv">
                  <div>
                    <strong>{a.name}</strong>
                    <small>připojeno {fmtDate(a.created_at)}{a.last_used_at ? ` · naposledy ${fmtDate(a.last_used_at)}` : ""}</small>
                  </div>
                  <form action={revokeConnection}><input type="hidden" name="id" value={a.id} /><ConfirmButton message={`Odpojit aplikaci ${a.name}?`}>Odpojit</ConfirmButton></form>
                </div>
              ))}
            </div>
          ) : <div className="empty">Zatím není připojená žádná AI aplikace.</div>}
        </section>
        </div>
        )}

        {!user.demo && group === "ucet" && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Profilovka</h2>
          <div className="card profile-av">
            <AvatarBig id={user.id} name={user.name} />
            <div style={{ flex: 1 }}>
              <AvatarUpload has={avatarVersion(user.id) != null} remove={removeMyAvatar} />
              <p className="hint" style={{ margin: "10px 0 0" }}>Před nahráním ji můžeš posunout a přiblížit, ukládá se jen zmenšená čtvercová verze. Kliknutím na profilovku ji zvětšíš.</p>
            </div>
          </div>
        </section>
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Účet</h2>
          <div className="card rows">
            <div className="kv">
              <div><small>Jméno</small><strong>{user.name}</strong><p className="hint" style={{ margin: "4px 0 0" }}>Jméno nastavuje správce podle seznamu studentů třídy.</p></div>
            </div>
            <div className="kv">
              <div><small>E-mail</small><strong>{user.email}</strong></div>
              <Pop label="Změnit">
                <ActionForm action={changeEmail}>
                  <input className="input" type="email" name="email" defaultValue={user.email} required aria-label="Nový e-mail" />
                  <input className="input" type="password" name="password" placeholder="Heslo pro potvrzení" autoComplete="current-password" required aria-label="Heslo" />
                  <Submit>Uložit</Submit>
                </ActionForm>
              </Pop>
            </div>
            <div className="kv"><div><small>Škola a třída</small><strong>{user.school_name}{" · "}{user.class_name}</strong></div></div>
          </div>
          <form action={logoutAction} style={{ marginTop: 14 }}><button className="btn">Odhlásit se</button></form>
        </section>

        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Zabezpečení</h2>
          <div className="card kv">
            <div>
              <strong>Dvoufázové ověření</strong>
              <small>{user.totp_enabled ? `Zapnuto · zbývá ${remainingRecoveryCodes(user.id)} záložních kódů` : "Vypnuto · chraň účet kódem z aplikace v telefonu"}</small>
            </div>
            {user.totp_enabled ? (
              <div className="btn-row">
                <Pop label="Nové záložní kódy"><PasswordForm action={regenerateCodes} submit="Vytvořit nové kódy" /></Pop>
                <Pop label="Vypnout" danger><PasswordForm action={disableTotp} submit="Vypnout 2FA" /></Pop>
              </div>
            ) : (
              <form action={beginTotp}><Submit className="btn small primary">Zapnout</Submit></form>
            )}
          </div>
        </section>

        <section>
          <h2 className="section">Moje data</h2>
          <p className="hint" style={{ margin: "4px 0 12px" }}>
            Co o tobě aplikace ukládá a jak s tím nakládá, najdeš v <Link href="/zasady-ochrany-osobnich-udaju" className="link-u">zásadách ochrany osobních údajů</Link> a <Link href="/pravidla-pouzivani" className="link-u">pravidlech používání</Link>.
          </p>
          <div className="btn-row">
            <DownloadButton />
            <Pop label="Smazat účet" danger><PasswordForm action={deleteAccount} submit="Smazat navždy" /></Pop>
          </div>
        </section>
        </div>
        )}

        {group === "aplikace" && (
        <div className="masonry">
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>O aplikaci</h2>
          <div className="card"><VersionInfo /></div>
          <p className="hint" style={{ margin: "12px 4px 0" }}><a href="https://plojharsim.cz" target="_blank" rel="noopener" className="link-u">Made by plojharsim</a></p>
        </section>
        <section>
          <h2 className="section" style={{ marginBottom: 12 }}>Poděkování</h2>
          <div className="card card-pad thanks">
            <ul>
              <li><b>Romanu Matsunychovi</b> (<a href="https://rome-prjcts.xo.je" target="_blank" rel="noopener" className="link-u">rome-prjcts.xo.je</a>) za vymyšlení názvu Classmate, vymýšlení nových funkcí a hledání bugů</li>
              <li><b>Jánu Gornyitzkému</b> za podporu při tvorbě a návrhu hromady nápadů</li>
              <li><b>Vítu Ouhrabkovi</b> (<a href="https://vitegg.com" target="_blank" rel="noopener" className="link-u">vitegg.com</a>) za návrhy nových funkcí a návrh tréninkového deníku</li>
              <li><b>Lukáši Štěrbovi</b> za testování aplikace a doporučení do budoucna</li>
              <li><b>Anastázii Pokludové</b> za první testování integrace Strava.cz</li>
            </ul>
          </div>
        </section>
        </div>
        )}
        </div>
      </div>
    </div>
  );
}
