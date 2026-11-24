"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendMessage } from "@/app/actions/komunikace";
import type { KomensType } from "@/lib/komens";
import { Icon } from "./Icon";
import { ActionForm, Submit } from "./forms";

export type Channel = "komens" | "posta" | "teams";
export type Preset = { channel: Channel; subject?: string; previous?: string; recipientName?: string; to?: string };

const LABEL: Record<Channel, { name: string; icon: string; hint: string }> = {
  komens: { name: "Komens", icon: "bell", hint: "Zpráva učiteli v Bakalářích" },
  posta: { name: "Školní e-mail", icon: "mail", hint: "E-mail z tvé školní adresy" },
  teams: { name: "Teams", icon: "pen", hint: "Chat nebo kanál týmu" },
};

type Load<T> = { s: "idle" | "loading" | "error" } | { s: "ready"; data: T };
type MailData = { contacts: { addr: string; name: string }[] };
type TeamsData = { chats: { id: string; name: string; kind: string }[]; teams: { id: string; name: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Výběr z dlouhého seznamu s hledáním; vybrané položky jsou štítky s křížkem. */
function Picker({ items, value, onChange, single, placeholder, label }: { items: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; single: boolean; placeholder: string; label: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const n = norm(q);
    return items.filter((i) => !value.includes(i.id) && (!n || norm(i.name).includes(n))).slice(0, 8);
  }, [items, value, q]);
  const pick = (id: string) => {
    onChange(single ? [id] : [...value, id]);
    setQ("");
    setOpen(single ? false : true);
  };
  const byId = new Map(items.map((i) => [i.id, i.name]));
  return (
    <div className="cmp-picker">
      {value.length > 0 && (
        <div className="cmp-chips">
          {value.map((id) => (
            <span key={id} className="cmp-chip">{byId.get(id) ?? id}<button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Odebrat ${byId.get(id) ?? id}`}><Icon name="plus" size={12} /></button></span>
          ))}
        </div>
      )}
      {!(single && value.length) && (
        <div className="cmp-search">
          <input className="input" value={q} placeholder={placeholder} aria-label={label} autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          {open && shown.length > 0 && (
            <ul className="cmp-list" role="listbox">
              {shown.map((i) => <li key={i.id}><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i.id)}>{i.name}</button></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Pole e-mailových adres: píšeš adresu (Enter, čárka nebo mezera ji potvrdí), nebo klikneš na návrh z nedávných odesílatelů. */
function Addresses({ value, onChange, contacts }: { value: string[]; onChange: (v: string[]) => void; contacts: { addr: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const commit = (raw = q) => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return true;
    if (parts.some((p) => !EMAIL.test(p))) {
      setBad(true);
      return false;
    }
    onChange([...new Set([...value, ...parts.map((p) => p.toLowerCase())])].slice(0, 5));
    setQ("");
    setBad(false);
    return true;
  };
  const n = norm(q);
  const sugg = contacts.filter((c) => !value.includes(c.addr) && (!n || norm(c.name).includes(n) || c.addr.includes(n))).slice(0, 5);
  return (
    <div className="cmp-picker">
      {value.length > 0 && <div className="cmp-chips">{value.map((a) => <span key={a} className="cmp-chip">{a}<button type="button" onClick={() => onChange(value.filter((x) => x !== a))} aria-label={`Odebrat ${a}`}><Icon name="plus" size={12} /></button></span>)}</div>}
      {value.length < 5 && (
        <input className="input" value={q} type="text" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="jmeno@priklad.cz" aria-label="Adresa příjemce" autoComplete="off" aria-invalid={bad}
          onChange={(e) => { const v = e.target.value; if (/[\s,;]$/.test(v) && v.trim().length > 1) commit(v); else { setQ(v); setBad(false); } }}
          onBlur={() => { if (q.trim()) commit(); }}
          onKeyDown={(e) => { if ([",", ";", " ", "Enter"].includes(e.key) && q.trim()) { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1)); }} />
      )}
      {bad && <p className="msg-error" role="alert" style={{ margin: 0 }}>Tohle není platná e-mailová adresa.</p>}
      {sugg.length > 0 && (
        <div className="cmp-sugg"><small>Nedávno ti psali</small>{sugg.map((c) => <button key={c.addr} type="button" className="chip plain" onClick={() => onChange([...value, c.addr])} title={c.addr}>{c.name}</button>)}</div>
      )}
    </div>
  );
}

/**
 * Jedno okno Nová zpráva pro celou Komunikaci: nejdřív se vybere, přes co zprávu poslat (Komens, školní e-mail, Teams), a podle toho se nabídne komu.
 * Předmět a text se při přepnutí kanálu zachovají.
 */
export function Compose({ channels, defaultChannel, preset, label = "Nová zpráva", className = "btn primary", icon = "plus" }: { channels: Channel[]; defaultChannel?: Channel; preset?: Preset; label?: string; className?: string; icon?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [channel, setChannel] = useState<Channel>(preset?.channel ?? defaultChannel ?? channels[0]);
  const [subject, setSubject] = useState(preset?.subject ?? "");
  const [text, setText] = useState("");
  // Komens
  const [komens, setKomens] = useState<Load<KomensType[]>>({ s: "idle" });
  const [type, setType] = useState("");
  const [group, setGroup] = useState("");
  const [rcpt, setRcpt] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [email, setEmail] = useState(false);
  // E-mail
  const [mail, setMail] = useState<Load<MailData>>({ s: "idle" });
  const [to, setTo] = useState<string[]>(preset?.to ? [preset.to] : []);
  // Teams
  const [teams, setTeams] = useState<Load<TeamsData>>({ s: "idle" });
  const [target, setTarget] = useState<"chat" | "channel">("chat");
  const [chat, setChat] = useState("");
  const [team, setTeam] = useState("");
  const [chans, setChans] = useState<Load<{ id: string; name: string }[]>>({ s: "idle" });
  const [chan, setChan] = useState("");

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  }, []);

  const loadKomens = useCallback(async () => {
    setKomens({ s: "loading" });
    try {
      const { types } = await fetchJson<{ types: KomensType[] }>("/api/komunikace/prijemci?k=komens");
      setKomens({ s: "ready", data: types });
      const t = types.find((x) => x.code === "OBECNA") ?? types[0];
      setType(t?.code ?? "");
      const g = t?.groups.find((x) => x.selection !== "none" && x.recipients.length) ?? t?.groups[0];
      setGroup(g?.code ?? "");
      const def = g?.recipients.filter((r) => r.isDefault).map((r) => r.code) ?? [];
      const byName = preset?.recipientName ? g?.recipients.find((r) => norm(r.name).includes(norm(preset.recipientName!)) || norm(preset.recipientName!).includes(norm(r.name))) : undefined;
      setRcpt(byName ? [byName.code] : def.slice(0, g?.selection === "one" ? 1 : 50));
    } catch {
      setKomens({ s: "error" });
    }
  }, [fetchJson, preset?.recipientName]);
  const loadMail = useCallback(async () => {
    setMail({ s: "loading" });
    try {
      setMail({ s: "ready", data: await fetchJson<MailData>("/api/komunikace/prijemci?k=posta") });
    } catch {
      setMail({ s: "error" });
    }
  }, [fetchJson]);
  const loadTeams = useCallback(async () => {
    setTeams({ s: "loading" });
    try {
      setTeams({ s: "ready", data: await fetchJson<TeamsData>("/api/komunikace/prijemci?k=teams") });
    } catch {
      setTeams({ s: "error" });
    }
  }, [fetchJson]);

  // Možnosti kanálu se stáhnou, až když je okno otevřené a kanál zvolený.
  useEffect(() => {
    if (!opened) return;
    if (channel === "komens" && komens.s === "idle") void loadKomens();
    if (channel === "posta" && mail.s === "idle") void loadMail();
    if (channel === "teams" && teams.s === "idle") void loadTeams();
  }, [opened, channel, komens.s, mail.s, teams.s, loadKomens, loadMail, loadTeams]);

  useEffect(() => {
    if (!team) return setChans({ s: "idle" });
    let live = true;
    setChans({ s: "loading" });
    setChan("");
    fetchJson<{ channels: { id: string; name: string }[] }>(`/api/komunikace/prijemci?k=teams&team=${encodeURIComponent(team)}`)
      .then((r) => live && setChans({ s: "ready", data: r.channels }))
      .catch(() => live && setChans({ s: "error" }));
    return () => { live = false; };
  }, [team, fetchJson]);

  const open = () => {
    setOpened(true);
    ref.current?.showModal();
  };
  const done = () => {
    ref.current?.close();
    window.dispatchEvent(new CustomEvent("classmate:toast", { detail: { title: `Zpráva odeslána`, body: `Přes ${LABEL[channel].name}.`, icon: "mail" } }));
    setText("");
    if (!preset?.subject) setSubject("");
    setTo(preset?.to ? [preset.to] : []);
    setConfirm(false);
    setEmail(false);
  };

  const kType = komens.s === "ready" ? komens.data.find((t) => t.code === type) : undefined;
  const kGroup = kType?.groups.find((g) => g.code === group);
  const subjectLabel = channel === "komens" ? "Předmět" : "Předmět e-mailu";
  const showSubject = channel === "posta" || (channel === "komens" && (kType?.hasTitle ?? true));
  const chooseType = (code: string) => {
    setType(code);
    const t = komens.s === "ready" ? komens.data.find((x) => x.code === code) : undefined;
    const g = t?.groups[0];
    setGroup(g?.code ?? "");
    setRcpt(g?.recipients.filter((r) => r.isDefault).map((r) => r.code) ?? []);
  };
  const chooseGroup = (code: string) => {
    setGroup(code);
    const g = kType?.groups.find((x) => x.code === code);
    setRcpt(g?.recipients.filter((r) => r.isDefault).map((r) => r.code).slice(0, g.selection === "one" ? 1 : 50) ?? []);
  };

  if (!channels.length) return null;
  const retry = (fn: () => void) => <p className="msg-error" role="alert">Možnosti se nepodařilo načíst. <button type="button" className="link-all" onClick={fn}>Zkusit znovu</button></p>;
  const loading = <div className="cmp-loading" role="status"><span className="sk" style={{ width: "100%", height: 50, borderRadius: 16 }} /></div>;

  return (
    <>
      <button type="button" className={className} onClick={open}><Icon name={icon} size={16} />{label}</button>
      <dialog ref={ref} className="modal cmp" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <div className="modal-card">
          <h2>{preset?.previous ? "Odpověď" : "Nová zpráva"}</h2>
          {channels.length > 1 && (
            <div className="cmp-channels" role="radiogroup" aria-label="Přes co poslat">
              {channels.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={channel === c} className="cmp-channel" onClick={() => setChannel(c)}>
                  <span><Icon name={LABEL[c].icon} size={18} /></span>
                  <b>{LABEL[c].name}</b>
                  <small>{LABEL[c].hint}</small>
                </button>
              ))}
            </div>
          )}
          <ActionForm action={sendMessage} onSuccess={done} resetOnSuccess={false}>
            <input type="hidden" name="channel" value={channel} />

            {channel === "komens" && (komens.s === "error" ? retry(loadKomens) : komens.s !== "ready" ? loading : !komens.data.length ? <p className="msg-error">Bakaláři ti zatím neumožňují posílat zprávy.</p> : (
              <>
                {komens.data.length > 1 && (
                  <label className="field"><span>Typ zprávy</span>
                    <select className="select" name="type" value={type} onChange={(e) => chooseType(e.target.value)}>{komens.data.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
                  </label>
                )}
                {komens.data.length === 1 && <input type="hidden" name="type" value={type} />}
                {kType && kType.groups.length > 1 && (
                  <label className="field"><span>Komu</span>
                    <select className="select" name="group" value={group} onChange={(e) => chooseGroup(e.target.value)}>{kType.groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select>
                  </label>
                )}
                {kType && kType.groups.length === 1 && <input type="hidden" name="group" value={group} />}
                {kGroup && kGroup.selection !== "none" && (
                  <div className="field"><span>{kGroup.selection === "one" ? "Příjemce" : "Příjemci"}</span>
                    <Picker items={kGroup.recipients.map((r) => ({ id: r.code, name: r.name }))} value={rcpt} onChange={setRcpt} single={kGroup.selection === "one"} placeholder="Hledej podle jména…" label="Hledat příjemce" />
                    {rcpt.map((r) => <input key={r} type="hidden" name="recipient" value={r} />)}
                  </div>
                )}
                {kGroup?.selection === "none" && <p className="hint" style={{ margin: 0 }}>Zpráva půjde všem ve skupině „{kGroup.name}“.</p>}
              </>
            ))}

            {channel === "posta" && (mail.s === "error" ? retry(loadMail) : mail.s !== "ready" ? loading : (
              <div className="field"><span>Komu</span>
                <Addresses value={to} onChange={setTo} contacts={mail.data.contacts} />
                <input type="hidden" name="to" value={to.join(", ")} />
              </div>
            ))}

            {channel === "teams" && (teams.s === "error" ? retry(loadTeams) : teams.s !== "ready" ? loading : (
              <>
                <div className="field"><span>Kam</span>
                  <div className="seg" role="radiogroup" aria-label="Kam v Teams">
                    <button type="button" role="radio" aria-checked={target === "chat"} aria-pressed={target === "chat"} onClick={() => setTarget("chat")}>Chat</button>
                    <button type="button" role="radio" aria-checked={target === "channel"} aria-pressed={target === "channel"} onClick={() => setTarget("channel")}>Kanál týmu</button>
                  </div>
                  <input type="hidden" name="target" value={target} />
                </div>
                {target === "chat" ? (
                  <label className="field"><span>Chat</span>
                    <select className="select" name="chat" value={chat} onChange={(e) => setChat(e.target.value)} required>
                      <option value="" disabled>Vyber chat…</option>
                      {teams.data.chats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="field"><span>Tým</span>
                      <select className="select" name="team" value={team} onChange={(e) => setTeam(e.target.value)} required>
                        <option value="" disabled>Vyber tým…</option>
                        {teams.data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                    {team && (chans.s === "error" ? retry(() => setTeam((t) => t + ""))  : chans.s !== "ready" ? loading : (
                      <label className="field"><span>Kanál</span>
                        <select className="select" name="channel_id" value={chan} onChange={(e) => setChan(e.target.value)} required>
                          <option value="" disabled>Vyber kanál…</option>
                          {chans.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </>
                )}
              </>
            ))}

            {showSubject && <label className="field"><span>{subjectLabel}</span><input className="input" name={channel === "komens" ? "title" : "subject"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required autoComplete="off" /></label>}
            <label className="field"><span>Zpráva</span><textarea className="textarea" name="text" rows={7} maxLength={20000} required value={text} onChange={(e) => setText(e.target.value)} /></label>

            {channel === "komens" && kType?.canConfirm && <label className="cmp-check"><input type="checkbox" name="confirm" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Požádat o potvrzení přečtení</label>}
            {channel === "komens" && kType?.canEmail && <label className="cmp-check"><input type="checkbox" name="email" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Upozornit příjemce e-mailem</label>}
            {channel === "komens" && preset?.previous && <input type="hidden" name="previous" value={preset.previous} />}

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Zrušit</button>
              <Submit pendingText="Odesílám…">Odeslat přes {LABEL[channel].name}</Submit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
