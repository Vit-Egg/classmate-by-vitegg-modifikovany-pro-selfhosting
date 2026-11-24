import { syncAction } from "../actions";
import { setting } from "@/lib/db";

export function Flash({ sp }: { sp: { e?: string; ok?: string } }) {
  if (sp.e) return <div className="msg e" role="alert">{sp.e}</div>;
  if (sp.ok) return <div className="msg ok" role="status">{sp.ok}</div>;
  return null;
}

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? "právě teď" : m < 60 ? `před ${m} min` : `před ${Math.round(m / 60)} h`;
};

export function SyncButton({ back }: { back: string }) {
  const last = Number(setting("last_sync") ?? 0);
  const err = setting("last_error");
  return (
    <form action={syncAction} className="row">
      <input type="hidden" name="back" value={back} />
      <span className="hint">{last ? `Načteno ${ago(last)}` : "Zatím nenačteno"}{err ? ` · ${err}` : ""}</span>
      <button className="btn small">Načíst znovu</button>
    </form>
  );
}

export type SP = Promise<{ e?: string; ok?: string; w?: string }>;
