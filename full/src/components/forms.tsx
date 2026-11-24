"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initial, type ActionState } from "@/lib/action";

export function Submit({ children, className = "btn primary", pendingText, disabled = false }: { children: ReactNode; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (pendingText ?? "Chvilku…") : children}
    </button>
  );
}

/** Formulář navázaný na server action; zobrazí chybu / hlášku / záložní kódy. */
export function ActionForm({
  action,
  children,
  className = "form",
  onSuccess,
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      if (resetOnSuccess && !state.codes) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && (
        <p className="msg-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p className="msg-ok">{state.message}</p>}
      {state.codes && (
        <div className="codes" aria-label="Záložní kódy">
          {state.codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
    </form>
  );
}

export function ConfirmButton({ message, children, className = "btn small danger" }: { message: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
