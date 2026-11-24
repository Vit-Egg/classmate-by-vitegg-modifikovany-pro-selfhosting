"use client";

/** „Nahlásit“ u cizího obsahu (poznámka, úkol, test nebo zkoušení od spolužáka): otevře zpětnou vazbu správci s předvyplněným odkazem. */
export function ReportButton({ what, className = "report-btn" }: { what: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      title="Nahlásit nevhodný obsah správci"
      onClick={() => window.dispatchEvent(new CustomEvent("classmate:feedback", { detail: { kind: "nahlasit", text: `Nahlašuji: ${what}\nDůvod: ` } }))}
    >
      Nahlásit
    </button>
  );
}
