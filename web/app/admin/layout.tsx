import Link from "next/link";
import type { ReactNode } from "react";

import { getCurrentAdmin } from "@/lib/admin-session";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/bitacora", label: "Bitácora" },
  { href: "/admin/propiedades", label: "Propiedades" },
  { href: "/admin/invitaciones", label: "Invitaciones" },
];

/**
 * Admin route group shell: desktop-first SaaS layout (sidebar + content),
 * deliberately distinct from the resident portal's mobile-first design
 * (specs/002) — different surface, different information density, per the
 * user's explicit "estilo SaaS" direction (specs/004/research.md). Doubles as
 * the route group's auth guard: `getCurrentAdmin()` redirects non-admins.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await getCurrentAdmin();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">CondoGATE Admin</div>
        <nav>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="admin-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link href="/">← Volver al portal</Link>
        </div>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}
