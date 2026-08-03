import { statusBadge } from "@/lib/format";
import { getCurrentAdmin } from "@/lib/admin-session";
import { InviteOwnerForm } from "./invite-owner-form";

export const dynamic = "force-dynamic";

interface ResidenteRow {
  id: string;
  propiedad_id: string;
  nombre: string;
  telefono: string;
  tipo: string;
  rut: string | null;
  patente: string | null;
  estado: string;
}

const TIPO_LABEL: Record<string, string> = {
  RESIDENT: "Residente principal",
  FAMILIAR: "Familiar",
  EMPLEADO: "Empleado doméstico",
};

/**
 * Every property in the condo, with its residents/family/employees and their
 * access status. RUT is shown here on purpose — admin-only visibility per
 * spec User Story 2 (residents already keep it private in /perfil, which
 * never renders it back to them beyond their own entry).
 */
export default async function AdminPropiedades() {
  const { supabase } = await getCurrentAdmin();

  const [{ data: propiedades }, { data: residentes }] = await Promise.all([
    supabase.from("propiedades").select("id, numero").order("numero"),
    supabase
      .from("residentes")
      .select("id, propiedad_id, nombre, telefono, tipo, rut, patente, estado")
      .returns<ResidenteRow[]>(),
  ]);

  const byProperty = new Map<string, ResidenteRow[]>();
  for (const r of residentes ?? []) {
    const list = byProperty.get(r.propiedad_id) ?? [];
    list.push(r);
    byProperty.set(r.propiedad_id, list);
  }

  return (
    <main>
      <h1>Propiedades</h1>
      <p className="muted">Todas las propiedades del condominio y quién tiene acceso en cada una.</p>

      <InviteOwnerForm propiedades={propiedades ?? []} />

      {!propiedades || propiedades.length === 0 ? (
        <div className="empty-state">
          <p>Sin propiedades registradas.</p>
        </div>
      ) : (
        propiedades.map((p) => {
          const miembros = byProperty.get(p.id) ?? [];
          return (
            <div key={p.id} className="property-group panel">
              <h3>Propiedad {p.numero}</h3>
              {miembros.length === 0 ? (
                <p className="muted">Sin residentes registrados.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>RUT</th><th>Patente</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                      {miembros.map((r) => {
                        const b = statusBadge(r.estado);
                        return (
                          <tr key={r.id}>
                            <td>{r.nombre}</td>
                            <td className="muted">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                            <td className="muted">{r.telefono}</td>
                            <td className="muted">{r.rut ?? "—"}</td>
                            <td className="muted">{r.patente ?? "—"}</td>
                            <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
