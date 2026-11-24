"use client";

import { useOptimistic } from "react";
import { toggleTask } from "@/app/actions/content";

/** Zaškrtnutí reaguje okamžitě, server se dozví o chvilku později. */
export function TaskCheck({ id, done }: { id: number; done: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  return (
    <form
      action={async (fd) => {
        setOptimistic(!optimistic);
        await toggleTask(fd);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="check" data-done={optimistic} aria-pressed={optimistic} aria-label={optimistic ? "Vrátit mezi otevřené" : "Označit jako hotové"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className="tick" d="m5 12 5 5 9-10" />
        </svg>
      </button>
    </form>
  );
}
