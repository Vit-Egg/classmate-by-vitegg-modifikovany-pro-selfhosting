import { syncAction } from "../actions";
import { setting } from "@/lib/db";

export function Flash({ sp }: { sp: { e?: string; ok?: string } }) {
  if (sp.e) return <p className="msg-error" role="alert" style={{ margin: "0 4px 18px" }}>{sp.e}</p>;
  if (sp.ok) return <p className="msg-ok" role="status" style={{ margin: "0 4px 18px" }}>{sp.ok}</p>;
  return null;
}

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? "právě teď" : m < 60 ? `před ${m} min` : `před ${Math.round(m / 60)} h`;
};

/** Stav synchronizace a tlačítko „Načíst znovu“ (v hlavičce stránky). */
export function SyncButton({ back }: { back: string }) {
  const last = Number(setting("last_sync") ?? 0);
  const err = setting("last_error");
  return (
    <form action={syncAction} className="btn-row">
      <input type="hidden" name="back" value={back} />
      <span className="hint" style={{ margin: 0 }}>{last ? `Z Bakalářů ${ago(last)}` : "Zatím nenačteno"}{err ? ` · ${err}` : ""}</span>
      <button className="btn small">Načíst znovu</button>
    </form>
  );
}

export function Head({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="title">{title}</h1>
        {sub && <p className="subtitle">{sub}</p>}
      </div>
      {children && <div className="head-actions">{children}</div>}
    </div>
  );
}

export type SP = Promise<{ e?: string; ok?: string; w?: string; t?: string }>;
