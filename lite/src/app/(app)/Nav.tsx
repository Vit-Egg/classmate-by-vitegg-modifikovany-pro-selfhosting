"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/", "Přehled"],
  ["/rozvrh", "Rozvrh"],
  ["/znamky", "Známky"],
  ["/absence", "Absence"],
  ["/komens", "Komens"],
  ["/obedy", "Obědy"],
  ["/widgety", "Widgety"],
] as const;

export function Nav() {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="Menu">
      <div className="brand">
        <b>Classmate lite</b>
        <small>by vitegg · self-hosted</small>
      </div>
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <div className="spacer" />
      <Link href="/nastaveni" aria-current={on("/nastaveni") ? "page" : undefined}>
        Nastavení
      </Link>
    </nav>
  );
}
