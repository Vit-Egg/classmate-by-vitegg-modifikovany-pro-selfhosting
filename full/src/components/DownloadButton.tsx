"use client";

import { useState } from "react";
import { downloadMyData } from "@/lib/download";

export function DownloadButton() {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true, error: null });
          setState({ busy: false, error: await downloadMyData() });
        }}
      >
        {state.busy ? "Připravuji…" : "Stáhnout moje data"}
      </button>
      {state.error && <span className="msg-error" role="alert">{state.error}</span>}
    </>
  );
}
