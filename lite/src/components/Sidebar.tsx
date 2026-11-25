"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const ITEMS = [
  { href: "/dnes", label: "Dnes", icon: "sun" },
  { href: "/rozvrh", label: "Rozvrh", icon: "calendar" },
  { href: "/znamky", label: "Známky", icon: "star" },
  { href: "/absence", label: "Absence", icon: "absence" },
  { href: "/komens", label: "Komens", icon: "mail" },
  { href: "/obedy", label: "Obědy", icon: "utensils" },
  { href: "/widgety", label: "Widgety", icon: "link" },
];

/** Menu ve stylu původního Classmate (na telefonu spodní lišta). V rámu Classmate je schované. */
export function Sidebar({ name, cls }: { name: string; cls: string }) {
  const path = usePathname();
  const link = (i: { href: string; label: string; icon: string }) => (
    <Link key={i.href} href={i.href} title={i.label} aria-current={path.startsWith(i.href) ? "page" : undefined}>
      <Icon name={i.icon} />
      <span className="nav-label">{i.label}</span>
    </Link>
  );
  return (
    <aside className="sidebar">
      <div className="brand">
        <Link href="/dnes" className="brand-name">
          <span className="brand-full">Classmate</span>
          <img className="brand-mini" src="/icon.svg" alt="" width={34} height={34} />
        </Link>
        <div className="brand-class">
          <span className="brand-class-text"><span>{name || "lite"}</span>{cls && <span>{cls}</span>}</span>
        </div>
      </div>
      <div className="nav-scroll">
        <nav className="nav" aria-label="Hlavní navigace">
          <div className="nav-items">{ITEMS.map(link)}</div>
        </nav>
      </div>
      <div className="side-foot">
        <nav className="nav nav-foot" aria-label="Nastavení">
          {link({ href: "/nastaveni", label: "Nastavení", icon: "settings" })}
        </nav>
        <div className="side-meta"><span className="hint" style={{ margin: 0 }}>Classmate lite · made by vitegg</span></div>
      </div>
    </aside>
  );
}
