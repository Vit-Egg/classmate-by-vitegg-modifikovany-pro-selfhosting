"use client";

import Link from "next/link";
import { useState } from "react";
import { versionTitle } from "@/lib/version";
import { ShareApp } from "./ShareApp";
import { tapVersion } from "@/lib/version-egg";

export function VersionInfo() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="kv">
      <div>
        <small>Verze</small>
        <strong className="ver-tap" onClick={tapVersion}>{versionTitle(false)}</strong>
      </div>
      <div className="btn-row">
      <ShareApp />
      <Link href="/devlog" className="btn small">Co je nového</Link>
      <button type="button" className="btn small" onClick={() => window.dispatchEvent(new CustomEvent("classmate:feedback"))}>Mám nápad</button>
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`Classmate, ${versionTitle()}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {}
        }}
      >
        {copied ? "Zkopírováno" : "Zkopírovat"}
      </button>
      </div>
    </div>
  );
}
