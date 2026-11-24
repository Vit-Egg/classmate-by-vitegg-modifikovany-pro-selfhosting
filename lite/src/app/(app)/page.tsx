import Link from "next/link";
import { bkConfigured, bkInfo } from "@/lib/bk";
import { ALL_WIDGETS, embedKey } from "@/lib/embed/core";
import { LITE_WIDGETS } from "@/lib/widgets";
import { Flash, SyncButton, type SP } from "./ui";

export const metadata = { title: "Přehled" };

/** Přehled je poskládaný ze stejných widgetů, které jdou vložit do Classmate: co vidíš tady, uvidíš i tam. */
export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const k = encodeURIComponent(embedKey());
  const info = bkInfo();
  return (
    <>
      <div className="head">
        <div>
          <h1>{info.name ? `Ahoj, ${info.name.split(" ").slice(-1)[0]}` : "Přehled"}</h1>
          <p className="sub">{info.cls ? `Třída ${info.cls} · ` : ""}rozvrh, známky, absence, Komens a obědy na jednom místě</p>
        </div>
        {bkConfigured() && <SyncButton back="/" />}
      </div>
      <Flash sp={sp} />
      {!bkConfigured() && (
        <div className="card" style={{ marginBottom: 16 }}>
          Bakaláři zatím nejsou propojení. <Link href="/nastaveni">Propojit v Nastavení</Link>
        </div>
      )}
      <div className="grid">
        {ALL_WIDGETS.filter((w) => LITE_WIDGETS.includes(w.id)).map((w) => (
          <iframe key={w.id} src={`/embed/${w.id}?k=${k}`} title={w.title} height={w.height} loading="lazy" sandbox="" />
        ))}
      </div>
    </>
  );
}
