"use client";

import { useState } from "react";
import { connectImapMail, replyMail, teamsSend } from "@/app/actions/komunikace";
import { ActionForm, Submit } from "./forms";

/** Přihlášení k obecné poště (IMAP) adresou a heslem. */
export function MailConnect({ domain }: { domain: string }) {
  return (
    <ActionForm action={connectImapMail} resetOnSuccess={false}>
      <label className="field">
        <span>Školní e-mail</span>
        <input className="input" type="email" name="address" placeholder={`jmeno@${domain}`} required autoComplete="username" />
      </label>
      <label className="field">
        <span>Heslo k e-mailu</span>
        <input className="input" type="password" name="password" required autoComplete="current-password" />
      </label>
      <p className="hint" style={{ margin: 0 }}>Heslo se uloží šifrovaně a použije se jen k přihlášení do tvé pošty. Odpojit ho můžeš kdykoli.</p>
      <div><Submit>Připojit</Submit></div>
    </ActionForm>
  );
}

export function MailReply({ folder, id }: { folder: string; id: string }) {
  return (
    <ActionForm action={replyMail}>
      <input type="hidden" name="folder" value={folder} />
      <input type="hidden" name="id" value={id} />
      <label className="field">
        <span>Odpovědět</span>
        <textarea className="textarea" name="text" rows={5} maxLength={20000} required placeholder="Napiš odpověď…" />
      </label>
      <div><Submit pendingText="Odesílám…">Odeslat odpověď</Submit></div>
    </ActionForm>
  );
}

/**
 * Tělo e-mailu v izolovaném rámečku: bez skriptů, formulářů a přístupu k aplikaci; obrázky z internetu se nenačítají (sledovací pixely).
 * Odkazy se otevírají v nové kartě.
 */
export function MailBody({ html }: { html: string }) {
  const [h, setH] = useState(520);
  const doc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><base target="_blank"><style>body{margin:14px;font:15px/1.5 system-ui,sans-serif;color:#1a1c20;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}a{color:#1d63d6}</style>${html}`;
  return (
    <div className="mail-frame">
      <iframe title="Text e-mailu" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={doc} style={{ height: h }} />
      <button type="button" className="link-btn" onClick={() => setH((x) => (x > 700 ? 520 : 1100))}>{h > 700 ? "Zmenšit" : "Zvětšit"} okno zprávy</button>
    </div>
  );
}

/** Pole pro odeslání zprávy v Teams (chat, příspěvek do kanálu, odpověď). Skryté hodnoty určují, kam zpráva půjde. */
export function TeamsSend({ fields, placeholder, button = "Odeslat" }: { fields: Record<string, string>; placeholder: string; button?: string }) {
  return (
    <ActionForm action={teamsSend}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <textarea className="textarea" name="text" rows={3} maxLength={10000} required placeholder={placeholder} aria-label={placeholder} />
      <div><Submit pendingText="Odesílám…">{button}</Submit></div>
    </ActionForm>
  );
}
