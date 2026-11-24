"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Úzká lišta nahoře, když zmizí připojení. Po návratu obnoví data. */
export function OfflineBanner() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const off = () => setOffline(true);
    const on = () => {
      setOffline(false);
      window.dispatchEvent(new CustomEvent("classmate:toast", { detail: { title: "Jsi zase online", body: "Data se obnovují.", icon: "refresh" } }));
      router.refresh();
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => (window.removeEventListener("offline", off), window.removeEventListener("online", on));
  }, [router]);
  if (!offline) return null;
  return (
    <div className="offline-pill" role="status">
      <Icon name="absence" size={15} /> Jsi offline. Ukazuji naposledy načtená data.
    </div>
  );
}
