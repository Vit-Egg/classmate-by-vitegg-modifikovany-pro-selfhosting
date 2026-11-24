import Link from "next/link";
import type { CacheResult } from "@/lib/types";

export function SyncNotice({ result }: { result: Pick<CacheResult<unknown>, "error" | "stale" | "data"> }) {
  if (!result.error) return null;
  return (
    <p className="empty" style={{ marginBottom: 20, padding: "14px 18px", color: "var(--warn)" }} role="status">
      {result.error === "disconnected" ? (
        <>
          Bakaláři nejsou propojené nebo přihlášení vypršelo. <Link href="/nastaveni" className="link-u">Propoj je znovu v Nastavení.</Link>
        </>
      ) : result.data ? (
        "Bakaláři teď neodpovídají, ukazuju naposledy načtená data."
      ) : (
        "Bakaláři teď neodpovídají a zatím nemám žádná data. Zkus to za chvíli."
      )}
    </p>
  );
}
