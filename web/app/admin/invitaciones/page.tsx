import { fmtDateTime, statusBadge } from "@/lib/format";
import { getCurrentAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

interface InvitacionRow {
  id: string;
  propiedad_id: string;
  visitante_nombre: string;
  visitante_telefono: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
}

/** Condo-wide invitations, property-labeled — "familias de paso" per the admin's own framing. */
export default async function AdminInvitaciones() {
  const { supabase } = await getCurrentAdmin();

  const [{ data: propiedades }, { data: invitaciones }] = await Promise.all([
    supabase.from("propiedades").select("id, numero"),
    supabase
      .from("invitaciones")
      .select("id, propiedad_id, visitante_nombre, visitante_telefono, fecha_inicio, fecha_fin, estado")
      .order("fecha_inicio", { ascending: false })
      .returns<InvitacionRow[]>(),
  ]);

  const propiedadNumero = new Map((propiedades ?? []).map((p) => [p.id as string, p.numero as string]));

  return (
    <main>
      <h1>Invitaciones</h1>
      <p className="muted">Todas las invitaciones del condominio, todas las propiedades.</p>

      {!invitaciones || invitaciones.length === 0 ? (
        <div className="empty-state">
          <p>Sin invitaciones registradas.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Propiedad</th><th>Visitante</th><th>Teléfono</th><th>Desde</th><th>Hasta</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {invitaciones.map((inv) => {
                const b = statusBadge(inv.estado);
                return (
                  <tr key={inv.id}>
                    <td>{propiedadNumero.get(inv.propiedad_id) ?? "—"}</td>
                    <td>{inv.visitante_nombre}</td>
                    <td className="muted">{inv.visitante_telefono}</td>
                    <td className="muted">{fmtDateTime(inv.fecha_inicio)}</td>
                    <td className="muted">{fmtDateTime(inv.fecha_fin)}</td>
                    <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
