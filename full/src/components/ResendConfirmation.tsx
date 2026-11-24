"use client";

import { useActionState } from "react";
import { initial, type ActionState } from "@/lib/action";

/** Tlačítko „Poslat potvrzení znovu“ s výsledkem pod sebou. */
export function ResendConfirmation({ action }: { action: (prev: ActionState) => Promise<ActionState> }) {
  const [state, run, pending] = useActionState(action, initial);
  return (
    <form action={run} style={{ display: "grid", gap: 8 }}>
      <button className="btn" disabled={pending}>{pending ? "Posílám…" : "Poslat potvrzení znovu"}</button>
      {state.message && <span className="hint" role="status">{state.message}</span>}
      {state.error && <span className="msg-error" role="alert">{state.error}</span>}
    </form>
  );
}
