"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Invitaciones", icon: "📨" },
  { href: "/historial", label: "Historial", icon: "🕓" },
  { href: "/invitar", label: "Invitar", icon: "➕" },
];

const HIDDEN_PREFIXES = ["/admin", "/login"];

/**
 * Fixed bottom tab bar (SafeCard visual reference) for the resident portal.
 * Hidden on /login and /admin — those have their own auth screen / sidebar
 * shell. A plain pathname check, not a route group, so no file moves were
 * needed for the existing resident pages.
 */
export function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav-tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
