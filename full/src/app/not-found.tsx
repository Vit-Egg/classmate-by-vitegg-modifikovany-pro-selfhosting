import Link from "next/link";

export const metadata = { title: "Stránka nenalezena", robots: { index: false, follow: true } };

/** Vlastní 404: žádná slepá ulička, nabídne cestu zpět (dobré pro návštěvníky i vyhledávače). */
export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 460 }}>
        <p style={{ color: "var(--muted)", margin: 0 }}>Chyba 404</p>
        <h1 className="title" style={{ margin: "6px 0 12px" }}>Tahle stránka tu není.</h1>
        <p style={{ color: "var(--muted)", marginBottom: 22 }}>Možná se změnila adresa nebo je v odkazu překlep. Zkus se vrátit na úvod.</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn primary">Úvodní stránka</Link>
          <Link href="/dnes" className="btn">Otevřít aplikaci</Link>
        </div>
      </div>
    </main>
  );
}
