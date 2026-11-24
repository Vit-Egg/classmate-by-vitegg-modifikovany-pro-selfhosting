import Link from "next/link";
import { Compose, type Channel } from "@/components/Compose";
import { MailBody, MailReply, TeamsSend } from "@/components/MailParts";
import { Icon } from "@/components/Icon";
import { getKomens, komensDetail, type KomensBox, type KomensMessage } from "@/lib/komens";
import { fmtDateTime, inDays } from "@/lib/dates";
import { teamsAccount, teamsAssignments, teamsChannelMessages, teamsChannels, teamsChatMessages, teamsChats, teamsFiles, teamsMeetings, teamsReplies, teamsTeams, type TeamsAssignment, type TeamsMessage } from "@/lib/teams";
import { MailError, mailAccount, mailbox, schoolMail, schoolMicrosoft, type Folder, type MailFull, type MailItem } from "@/lib/mailbox";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Komunikace" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const TABS = [
  { id: "komens", label: "Komens", box: "received" as KomensBox },
  { id: "nastenka", label: "Nástěnka", box: "noticeboard" as KomensBox },
  { id: "odeslane", label: "Odeslané", box: "sent" as KomensBox },
  { id: "posta", label: "Školní e-mail" },
  { id: "teams", label: "Teams" },
];
function NotConnected({ what }: { what: string }) {
  return (
    <div className="card card-pad comm-connect">
      <h2 className="section" style={{ marginBottom: 6 }}>{what[0].toUpperCase() + what.slice(1)} zatím není propojený</h2>
      <p className="hint" style={{ margin: "0 0 16px" }}>Propojení se dělá na jednom místě v Nastavení.</p>
      <Link href="/nastaveni?k=propojeni#propojeni" className="btn primary">Propojit v Nastavení</Link>
    </div>
  );
}
const when = (ms: number) => (ms ? fmtDateTime(ms) : "");
const plain = (s: string, n = 140) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

type SP = { t?: string; m?: string; f?: string; p?: string; chyba?: string; s?: string; c?: string; team?: string; ch?: string; v?: string; dir?: string; dn?: string };

export default async function CommPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  // Školní e-mail a Teams se nabízejí jen tam, kde je škola má zapnuté
  const tabs = TABS.filter((t) => (t.id === "posta" ? !!schoolMail(user.school_id) : t.id === "teams" ? !!schoolMicrosoft(user.school_id) : true));
  const tab = tabs.find((t) => t.id === sp.t) ?? tabs[0];
  const open = sp.m ?? "";
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ t: tab.id });
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    return `/komunikace?${p}`;
  };

  const unread: Record<string, number> = {};
  if (user.bakalari_refresh_enc) {
    for (const t of tabs) if (t.box && t.box !== "sent") {
      const r = await getKomens(user, t.box);
      unread[t.id] = (r.data ?? []).filter((m) => !m.read).length;
    }
  }

  // Kde všude může uživatel zprávu poslat: jen přes propojené služby
  const channels: Channel[] = [];
  if (user.bakalari_refresh_enc) channels.push("komens");
  const mailCfg = schoolMail(user.school_id);
  if (mailCfg && mailAccount(user.id, mailCfg.kind)) channels.push("posta");
  if (schoolMicrosoft(user.school_id) && teamsAccount(user.id)) channels.push("teams");

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Komunikace</h1>
          <p className="subtitle">Komens, nástěnka, školní e-mail a Teams na jednom místě</p>
        </div>
        <Compose channels={channels} defaultChannel={tab.id === "posta" ? "posta" : tab.id === "teams" ? "teams" : "komens"} />
      </div>
      <div className="toolbar">
        <nav className="seg" aria-label="Zdroj zpráv">
          {tabs.map((t) => (
            <Link key={t.id} href={`/komunikace?t=${t.id}`} aria-current={t.id === tab.id}>
              {t.label}{unread[t.id] ? <span className="seg-count">{unread[t.id]}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
      {tab.box ? <KomensView user={user} tab={tab as { id: string; box: KomensBox }} open={open} q={q} /> : tab.id === "teams" ? <TeamsView user={user} sp={sp} /> : <MailView user={user} sp={sp} open={open} q={q} />}
    </div>
  );
}

/* ---------- Komens a nástěnka ---------- */

async function KomensView({ user, tab, open, q }: { user: Awaited<ReturnType<typeof requireUser>>; tab: { id: string; box: KomensBox }; open: string; q: (o: Record<string, string | undefined>) => string }) {
  if (!user.bakalari_refresh_enc) return <div className="empty">Nejdřív propoj Bakaláře v <Link href="/nastaveni" className="link-u">Nastavení</Link>.</div>;
  const r = await getKomens(user, tab.box);
  if (!r.data) return <div className="empty">{r.error === "disconnected" ? "Bakaláři odpojeni, propoj je znovu v Nastavení." : "Bakaláři teď nejsou dostupné, zkus to za chvíli."}</div>;
  let detail: KomensMessage | null = null;
  if (open) {
    try {
      detail = await komensDetail(user, tab.box, open);
    } catch {
      detail = r.data.find((m) => m.id === open) ?? null; // detail se nepodařilo stáhnout, ukážeme aspoň to, co je v seznamu
    }
  }
  const list = detail ? r.data.map((m) => (m.id === detail!.id ? { ...m, read: true } : m)) : r.data;
  return (
    <div className="comm" data-open={detail ? "" : undefined}>
      <div className="comm-list card rows">
        {list.length ? list.map((m) => (
          <Link key={m.id} href={q({ m: m.id })} className={`comm-item${m.read ? "" : " unread"}${detail?.id === m.id ? " active" : ""}`}>
            <div className="ci-top"><b>{tab.box === "sent" ? "Odesláno" : m.sender || "Škola"}</b><span>{when(Date.parse(m.sentAt))}</span></div>
            <div className="ci-title">{m.title}</div>
            <div className="ci-prev">{plain(m.text)}</div>
          </Link>
        )) : <div className="empty">{tab.box === "noticeboard" ? "Na nástěnce nic není." : tab.box === "sent" ? "Zatím jsi v Komens nic neodeslal(a)." : "Žádné zprávy."}</div>}
      </div>
      <div className="comm-detail">
        {detail ? (
          <article className="card card-pad">
            <Link href={q({})} className="comm-back link-all">← Zprávy</Link>
            <h2 className="comm-h">{detail.title}</h2>
            <p className="comm-meta">{tab.box === "sent" ? "Odesláno" : detail.sender}{detail.sender || tab.box === "sent" ? " · " : ""}{when(Date.parse(detail.sentAt))}</p>
            <div className="comm-text">{detail.text || "Zpráva nemá žádný text."}</div>
            {detail.attachments.length > 0 && (
              <div className="comm-atts">
                {detail.attachments.map((a) => <a key={a.id} className="btn small" href={`/komunikace/priloha?k=komens&id=${encodeURIComponent(a.id)}&n=${encodeURIComponent(a.name)}`}><Icon name="file" size={14} /> {a.name}</a>)}
              </div>
            )}
            {tab.box === "received" ? (
              <div style={{ marginTop: 20 }}><Compose channels={["komens"]} preset={{ channel: "komens", subject: /^re:/i.test(detail.title) ? detail.title : `Re: ${detail.title}`, previous: detail.id, recipientName: detail.sender }} label="Odpovědět" className="btn" icon="refresh" /></div>
            ) : tab.box === "sent" ? null : <p className="hint" style={{ marginTop: 18 }}>Na nástěnku se neodpovídá.</p>}
          </article>
        ) : <div className="empty comm-empty">Vyber zprávu vlevo.</div>}
      </div>
    </div>
  );
}

/* ---------- školní e-mail ---------- */

async function MailView({ user, sp, open, q }: { user: Awaited<ReturnType<typeof requireUser>>; sp: SP; open: string; q: (o: Record<string, string | undefined>) => string }) {
  const cfg = schoolMail(user.school_id);
  if (!cfg) return <div className="empty">Tvoje škola zatím nemá nastavený školní e-mail. Správce ho může nastavit ve Správě u školy.</div>;
  const acc = mailAccount(user.id, cfg.kind);
  if (!acc) return <NotConnected what={cfg.kind === "microsoft" ? "Microsoft 365 (školní e-mail)" : "školní e-mail"} />;

  const folder: Folder = sp.f === "sent" ? "sent" : "inbox";
  const page = Math.max(1, Number(sp.p) || 1);
  let items: MailItem[] = [];
  let more = false;
  let detail: MailFull | null = null;
  let problem = "";
  try {
    const box = mailbox(user);
    const r = await box.list(folder, PAGE, (page - 1) * PAGE);
    items = r.items;
    more = r.more;
    if (open) {
      detail = await box.get(folder, open);
      if (detail.unread) {
        await box.markRead(folder, open).catch(() => {});
        items = items.map((m) => (m.id === open ? { ...m, unread: false } : m));
      }
    }
  } catch (e) {
    problem = e instanceof MailError ? e.message : "Pošta se nepodařilo načíst.";
  }

  return (
    <>
      <div className="mail-bar">
        <nav className="seg" aria-label="Složka">
          <Link href={q({ f: "inbox" })} aria-current={folder === "inbox"}>Doručená</Link>
          <Link href={q({ f: "sent" })} aria-current={folder === "sent"}>Odeslaná</Link>
        </nav>
        <span className="chip plain" title="Připojený účet">{acc.address}</span>
        <div className="btn-row" style={{ marginLeft: "auto" }}>
          <Link href="/nastaveni?k=propojeni#propojeni" className="btn small">Spravovat propojení</Link>
        </div>
      </div>
      {problem && <p className="msg-error" role="alert">{problem}</p>}
      {!problem && (
        <div className="comm" data-open={detail ? "" : undefined}>
          <div className="comm-list card rows">
            {items.length ? items.map((m) => (
              <Link key={m.id} href={q({ f: folder === "sent" ? "sent" : undefined, m: m.id, p: page > 1 ? String(page) : undefined })} className={`comm-item${m.unread ? " unread" : ""}${detail?.id === m.id ? " active" : ""}`}>
                <div className="ci-top"><b>{m.from || "(neznámý odesílatel)"}</b><span>{when(m.date)}</span></div>
                <div className="ci-title">{m.subject}{m.attachments ? " 📎" : ""}</div>
                {m.preview && <div className="ci-prev">{plain(m.preview)}</div>}
              </Link>
            )) : <div className="empty">Ve složce nic není.</div>}
            {(page > 1 || more) && (
              <div className="comm-pager">
                {page > 1 ? <Link className="btn small" href={q({ f: folder === "sent" ? "sent" : undefined, p: page > 2 ? String(page - 1) : undefined })}>← Novější</Link> : <span />}
                {more && <Link className="btn small" href={q({ f: folder === "sent" ? "sent" : undefined, p: String(page + 1) })}>Starší →</Link>}
              </div>
            )}
          </div>
          <div className="comm-detail">
            {detail ? (
              <article className="card card-pad">
                <Link href={q({ f: folder === "sent" ? "sent" : undefined, p: page > 1 ? String(page) : undefined })} className="comm-back link-all">← Zprávy</Link>
                <h2 className="comm-h">{detail.subject}</h2>
                <p className="comm-meta">{folder === "sent" ? `Komu: ${detail.to}` : `${detail.from}${detail.fromAddr ? ` <${detail.fromAddr}>` : ""}`} · {when(detail.date)}</p>
                {detail.html ? <MailBody html={detail.html} /> : <div className="comm-text">{detail.text || "Zpráva nemá žádný text."}</div>}
                {detail.atts.length > 0 && (
                  <div className="comm-atts">
                    {detail.atts.map((a) => <a key={a.id} className="btn small" href={`/komunikace/priloha?k=posta&f=${folder}&m=${encodeURIComponent(detail!.id)}&a=${encodeURIComponent(a.id)}`}><Icon name="file" size={14} /> {a.name}</a>)}
                  </div>
                )}
                {folder === "inbox" && <div style={{ marginTop: 22 }}><MailReply folder={folder} id={detail.id} /></div>}
              </article>
            ) : <div className="empty comm-empty">Vyber zprávu vlevo.</div>}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Microsoft Teams ---------- */

const STATE: Record<TeamsAssignment["state"], string> = { todo: "neodevzdáno", working: "rozpracováno", submitted: "odevzdáno", returned: "vráceno s hodnocením" };
const dueLabel = (ms: number | null) => {
  if (ms == null) return "bez termínu";
  const days = Math.floor((ms - Date.now()) / 86_400_000);
  return `${fmtDateTime(ms)} · ${days < 0 ? "po termínu" : days === 0 ? "dnes" : days === 1 ? "zítra" : inDays(days)}`;
};
const SUBTABS = [{ id: "prehled", label: "Přehled" }, { id: "chaty", label: "Chaty" }, { id: "tymy", label: "Týmy a kanály" }];
const problem = (e: unknown) => (e instanceof MailError ? e.message : "nepodařilo se načíst.");
const size = (n: number | null) => (n == null ? "" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
type U = Awaited<ReturnType<typeof requireUser>>;

function Bubbles({ list }: { list: TeamsMessage[] }) {
  if (!list.length) return <div className="empty">Žádné zprávy.</div>;
  return (
    <div className="tm-list">
      {list.map((m) => (
        <div key={m.id} className={`tm${m.mine ? " mine" : ""}${m.system ? " system" : ""}`}>
          <div className="tm-head"><b>{m.from || "Systém"}</b><span>{m.at ? fmtDateTime(m.at) : ""}</span></div>
          <div className="comm-text">{m.text || (m.attachments.length ? "" : "(bez textu)")}</div>
          {m.attachments.length > 0 && <div className="comm-atts">{m.attachments.map((a) => <a key={a.url} className="btn small" href={a.url} target="_blank" rel="noopener noreferrer"><Icon name="file" size={14} /> {a.name}</a>)}</div>}
        </div>
      ))}
    </div>
  );
}

async function TeamsView({ user, sp }: { user: U; sp: SP }) {
  if (!schoolMicrosoft(user.school_id)) return <div className="empty">Teams se připojuje školním účtem Microsoft 365. Tvoje škola ho zatím nemá nastavený.</div>;
  if (!teamsAccount(user.id)) return <NotConnected what="Microsoft Teams" />;
  const sub = SUBTABS.find((x) => x.id === sp.s) ?? SUBTABS[0];
  return (
    <div className="teams">
      <nav className="seg" aria-label="Teams" style={{ marginBottom: 18 }}>
        {SUBTABS.map((x) => <Link key={x.id} href={`/komunikace?t=teams&s=${x.id}`} aria-current={x.id === sub.id}>{x.label}</Link>)}
      </nav>
      {sub.id === "prehled" ? <TeamsOverview user={user} /> : sub.id === "chaty" ? <TeamsChats user={user} sp={sp} /> : <TeamsTeams user={user} sp={sp} />}
      <p className="hint" style={{ marginTop: 18 }}>Účet {teamsAccount(user.id)!.address} · propojení spravuješ v <Link href="/nastaveni?k=propojeni#propojeni" className="link-u">Nastavení</Link></p>
    </div>
  );
}

async function TeamsOverview({ user }: { user: U }) {
  let assignments: TeamsAssignment[] = [];
  let meetings: Awaited<ReturnType<typeof teamsMeetings>> = [];
  const problems: string[] = [];
  await Promise.all([
    teamsAssignments(user.id).then((a) => (assignments = a)).catch((e) => problems.push(`Zadání: ${problem(e)}`)),
    teamsMeetings(user.id).then((m) => (meetings = m)).catch((e) => problems.push(`Schůzky: ${problem(e)}`)),
  ]);
  return (
    <>
      {problems.map((p) => <p key={p} className="msg-error" role="alert">{p}</p>)}
      <div className="auto-cols">
        <section>
          <h2 className="group-title">Zadání</h2>
          {assignments.length ? (
            <div className="card rows">
              {assignments.map((a) => (
                <a key={a.id} className="item" href={a.url} target="_blank" rel="noopener noreferrer">
                  <div className="item-main">
                    <div className="item-title">{a.title}</div>
                    <div className="item-meta">
                      {a.className && <span className="chip plain">{a.className}</span>}
                      <span className={`chip${a.state === "todo" && a.due != null && a.due < Date.now() ? " danger-chip" : a.state === "submitted" || a.state === "returned" ? "" : " plain"}`}>{STATE[a.state]}</span>
                      <span>{dueLabel(a.due)}</span>
                    </div>
                    {a.instructions && <p className="hint" style={{ margin: "6px 0 0" }}>{plain(a.instructions.replace(/\s+/g, " "), 180)}</p>}
                  </div>
                </a>
              ))}
            </div>
          ) : !problems.some((p) => p.startsWith("Zadání")) && <div className="empty">V Teams nemáš žádná aktuální zadání.</div>}
        </section>
        <section>
          <h2 className="group-title">Schůzky v Teams (7 dní)</h2>
          {meetings.length ? (
            <div className="card rows">
              {meetings.map((m) => (
                <div key={m.id} className="item">
                  <div className="item-main">
                    <div className="item-title">{m.title}</div>
                    <div className="item-meta"><span>{fmtDateTime(m.start)}</span>{m.organizer && <span>{m.organizer}</span>}</div>
                  </div>
                  <a className="btn small" href={m.joinUrl} target="_blank" rel="noopener noreferrer">Připojit se</a>
                </div>
              ))}
            </div>
          ) : !problems.some((p) => p.startsWith("Schůzky")) && <div className="empty">Žádné online schůzky na příští týden.</div>}
        </section>
      </div>
    </>
  );
}

async function TeamsChats({ user, sp }: { user: U; sp: SP }) {
  let chats: Awaited<ReturnType<typeof teamsChats>> = [];
  try {
    chats = await teamsChats(user.id);
  } catch (e) {
    return <p className="msg-error" role="alert">Chaty: {problem(e)}</p>;
  }
  const open = chats.find((c) => c.id === sp.c);
  let msgs: TeamsMessage[] = [];
  let bad = "";
  if (open) await teamsChatMessages(user.id, open.id).then((m) => (msgs = m)).catch((e) => (bad = problem(e)));
  const href = (id?: string) => `/komunikace?t=teams&s=chaty${id ? `&c=${encodeURIComponent(id)}` : ""}`;
  return (
    <div className="comm" data-open={open ? "" : undefined}>
      <div className="comm-list card rows">
        {chats.length ? chats.map((c) => (
          <Link key={c.id} href={href(c.id)} className={`comm-item${open?.id === c.id ? " active" : ""}`}>
            <div className="ci-top"><b>{c.name}</b><span>{c.lastAt ? fmtDateTime(c.lastAt) : ""}</span></div>
            {c.preview && <div className="ci-prev">{c.lastFrom ? `${c.lastFrom}: ` : ""}{c.preview}</div>}
          </Link>
        )) : <div className="empty">Žádné chaty.</div>}
      </div>
      <div className="comm-detail">
        {open ? (
          <article className="card card-pad">
            <Link href={href()} className="comm-back link-all">← Chaty</Link>
            <h2 className="comm-h">{open.name}</h2>
            {bad ? <p className="msg-error">{bad}</p> : <Bubbles list={msgs} />}
            <div style={{ marginTop: 18 }}><TeamsSend fields={{ kind: "chat", chat: open.id }} placeholder="Napiš zprávu…" button="Odeslat" /></div>
          </article>
        ) : <div className="empty comm-empty">Vyber chat vlevo.</div>}
      </div>
    </div>
  );
}

async function TeamsTeams({ user, sp }: { user: U; sp: SP }) {
  let teams: Awaited<ReturnType<typeof teamsTeams>> = [];
  try {
    teams = await teamsTeams(user.id);
  } catch (e) {
    return <p className="msg-error" role="alert">Týmy: {problem(e)}</p>;
  }
  const team = teams.find((t) => t.id === sp.team);
  const base = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ t: "teams", s: "tymy" });
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    return `/komunikace?${p}`;
  };
  let channels: Awaited<ReturnType<typeof teamsChannels>> = [];
  let bad = "";
  if (team) await teamsChannels(user.id, team.id).then((c) => (channels = c)).catch((e) => (bad = problem(e)));
  const channel = channels.find((c) => c.id === sp.ch);
  const view = sp.v === "soubory" ? "soubory" : "zpravy";

  return (
    <div className="comm" data-open={team ? "" : undefined}>
      <div className="comm-list card rows">
        {teams.length ? teams.map((t) => (
          <div key={t.id}>
            <Link href={base({ team: t.id })} className={`comm-item${team?.id === t.id ? " active" : ""}`}><div className="ci-title"><b>{t.name}</b></div></Link>
            {team?.id === t.id && channels.map((c) => (
              <Link key={c.id} href={base({ team: t.id, ch: c.id })} className={`comm-item sub${channel?.id === c.id && view === "zpravy" ? " active" : ""}`}><div className="ci-title"># {c.name}</div></Link>
            ))}
            {team?.id === t.id && <Link href={base({ team: t.id, v: "soubory" })} className={`comm-item sub${view === "soubory" && !channel ? " active" : ""}`}><div className="ci-title">Soubory týmu</div></Link>}
          </div>
        )) : <div className="empty">Nejsi v žádném týmu.</div>}
      </div>
      <div className="comm-detail">
        {!team ? <div className="empty comm-empty">Vyber tým vlevo.</div>
          : bad ? <p className="msg-error">{bad}</p>
          : view === "soubory" ? <TeamFiles user={user} team={team} sp={sp} base={base} />
          : channel ? <ChannelView user={user} team={team} channel={channel} sp={sp} base={base} />
          : <div className="empty comm-empty">Vyber kanál nebo soubory týmu {team.name}.</div>}
      </div>
    </div>
  );
}

async function ChannelView({ user, team, channel, sp, base }: { user: U; team: { id: string; name: string }; channel: { id: string; name: string }; sp: SP; base: (o: Record<string, string | undefined>) => string }) {
  let posts: TeamsMessage[] = [];
  let bad = "";
  await teamsChannelMessages(user.id, team.id, channel.id).then((m) => (posts = m)).catch((e) => (bad = problem(e)));
  const thread = posts.find((p) => p.id === sp.m);
  let replies: TeamsMessage[] = [];
  if (thread) await teamsReplies(user.id, team.id, channel.id, thread.id).then((r) => (replies = r)).catch((e) => (bad = problem(e)));
  const back = base({ team: team.id, ch: channel.id });
  return (
    <article className="card card-pad">
      <Link href={base({})} className="comm-back link-all">← Týmy</Link>
      <h2 className="comm-h">{team.name} · # {channel.name}</h2>
      {bad && <p className="msg-error">{bad}</p>}
      {thread ? (
        <>
          <Link href={back} className="link-all">← Všechny příspěvky</Link>
          <Bubbles list={[thread, ...replies]} />
          <div style={{ marginTop: 18 }}><TeamsSend fields={{ kind: "reply", team: team.id, channel: channel.id, message: thread.id }} placeholder="Napiš odpověď…" button="Odpovědět" /></div>
        </>
      ) : (
        <>
          <div className="tm-list">
            {posts.length ? posts.map((p) => (
              <Link key={p.id} href={base({ team: team.id, ch: channel.id, m: p.id })} className="tm link">
                <div className="tm-head"><b>{p.from || "Systém"}</b><span>{p.at ? fmtDateTime(p.at) : ""}</span></div>
                <div className="comm-text">{plain(p.text, 400) || (p.attachments.length ? `📎 ${p.attachments.map((a) => a.name).join(", ")}` : "(bez textu)")}</div>
              </Link>
            )) : !bad && <div className="empty">V kanálu zatím nic není.</div>}
          </div>
          <div style={{ marginTop: 18 }}><TeamsSend fields={{ kind: "post", team: team.id, channel: channel.id }} placeholder={`Napsat do kanálu # ${channel.name}…`} button="Přidat příspěvek" /></div>
        </>
      )}
    </article>
  );
}

async function TeamFiles({ user, team, sp, base }: { user: U; team: { id: string; name: string }; sp: SP; base: (o: Record<string, string | undefined>) => string }) {
  let files: Awaited<ReturnType<typeof teamsFiles>> = [];
  let bad = "";
  await teamsFiles(user.id, team.id, sp.dir).then((f) => (files = f)).catch((e) => (bad = problem(e)));
  return (
    <article className="card card-pad">
      <Link href={base({})} className="comm-back link-all">← Týmy</Link>
      <h2 className="comm-h">{team.name} · Soubory{sp.dn ? ` · ${sp.dn}` : ""}</h2>
      {sp.dir && <Link href={base({ team: team.id, v: "soubory" })} className="link-all">← Hlavní složka</Link>}
      {bad ? <p className="msg-error">{bad}</p> : files.length ? (
        <div className="card rows" style={{ marginTop: 12 }}>
          {files.map((f) => f.folder ? (
            <Link key={f.id} href={base({ team: team.id, v: "soubory", dir: f.id, dn: f.name })} className="item"><Icon name="file" size={18} /><div className="item-main"><div className="item-title">📁 {f.name}</div></div></Link>
          ) : (
            <a key={f.id} href={f.url || undefined} target="_blank" rel="noopener noreferrer" className="item"><Icon name="file" size={18} /><div className="item-main"><div className="item-title">{f.name}</div><div className="item-meta"><span>{size(f.size)}</span>{f.modified ? <span>{fmtDateTime(f.modified)}</span> : null}</div></div></a>
          ))}
        </div>
      ) : <div className="empty">Složka je prázdná.</div>}
    </article>
  );
}
