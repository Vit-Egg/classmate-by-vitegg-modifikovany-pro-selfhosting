"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Čtenář sdílené poznámky: sleduje živé změny autora a po nich (s krátkou prodlevou) stránku načte znovu. */
export function LiveRefresh({ id }: { id: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const es = new EventSource(`/poznamky/${id}/spoluprace`);
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 700);
    };
    es.addEventListener("init", () => {
      if (first) first = false;
      else later(); // po výpadku spojení se dožene, co se mezitím změnilo
    });
    for (const ev of ["update", "meta", "board", "reset"]) es.addEventListener(ev, later);
    for (const ev of ["kicked", "failed"]) es.addEventListener(ev, () => es.close());
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [id, router]);
  return null;
}
