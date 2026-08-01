import Link from "next/link";

import { getCurrentAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/** Landing page: counts tying US1-US3 together, built last since it just summarizes them. */
export default async function AdminOverview() {
  const { supabase } = await getCurrentAdmin();

  const [propiedades, familia, invitacionesActivas] = await Promise.all([
    supabase.from("propiedades").select("id", { count: "exact", head: true }),
    supabase
      .from("residentes")
      .select("id", { count: "exact", head: true })
      .in("tipo", ["FAMILIAR", "EMPLEADO"])
      .eq("estado", "ACTIVE"),
    supabase
      .from("invitaciones")
      .select("id", { count: "exact", head: true })
      .eq("estado", "ACTIVE"),
  ]);

  return (
    <main>
      <h1>Resumen</h1>
      <p className="muted">Vista general del condominio.</p>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{propiedades.count ?? 0}</div>
          <div className="stat-label">Propiedades</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{familia.count ?? 0}</div>
          <div className="stat-label">Familiares + empleados activos</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{invitacionesActivas.count ?? 0}</div>
          <div className="stat-label">Invitaciones activas</div>
        </div>
      </div>

      <div className="toolbar">
        <Link href="/admin/bitacora">Ver bitácora →</Link>
        <Link href="/admin/propiedades">Ver propiedades →</Link>
        <Link href="/admin/invitaciones">Ver invitaciones →</Link>
      </div>
    </main>
  );
}
