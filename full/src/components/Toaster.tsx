"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type ToastInput = { title: string; body?: string; href?: string; icon?: string; /** tlačítko u oznámení */ action?: { label: string; run: () => void }; /** zůstane déle (důležitá oznámení) */ sticky?: boolean };
type Toast = ToastInput & { id: number };

const MAX = 3;
const LIFETIME = 7000;

/** Nerušivé vyskakovací oznámení v rohu. Spouští se událostí `classmate:toast`; po chvíli samo zmizí, najetím myší se pozastaví. */
export function Toaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const arm = useCallback((id: number, ms = LIFETIME) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastInput>).detail;
      if (!d?.title) return;
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-(MAX - 1)), { ...d, id }]);
      arm(id, d.sticky ? 30_000 : LIFETIME);
    };
    window.addEventListener("classmate:toast", onToast);
    const map = timers.current;
    return () => {
      window.removeEventListener("classmate:toast", onToast);
      map.forEach(clearTimeout);
    };
  }, [arm]);

  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onMouseEnter={() => clearTimeout(timers.current.get(t.id))} onMouseLeave={() => arm(t.id, 2500)}>
          <button
            type="button"
            className="toast-main"
            onClick={() => {
              dismiss(t.id);
              if (t.href && /^\/(?![/\\])/.test(t.href)) router.push(t.href);
            }}
          >
            <span className="toast-icon"><Icon name={t.icon ?? "bell"} size={16} /></span>
            <span className="toast-text">
              <b>{t.title}</b>
              {t.body && <small>{t.body}</small>}
            </span>
          </button>
          {t.action && (
            <button type="button" className="toast-act" onClick={() => (dismiss(t.id), t.action!.run())}>
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast-x" aria-label="Zavřít oznámení" onClick={() => dismiss(t.id)}>×</button>
          <i className="toast-bar" style={{ animationDuration: `${t.sticky ? 30_000 : LIFETIME}ms` }} />
        </div>
      ))}
    </div>
  );
}
