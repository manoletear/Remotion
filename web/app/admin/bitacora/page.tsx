import { eventBadge, fmtDateTime } from "@/lib/format";
import { getCurrentAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

interface EventoRow {
  id: string;
  tipo: string;
  entidad: string;
  entidad_id: string;
  fecha: string;
}

/**
 * Condo-wide audit trail. `eventos` rows carry no direct property reference —
 * `entidad`/`entidad_id` point at whichever table the event is about (mirrors
 * the polymorphism migration 0007's RLS policy already branches on) — so the
 * property label is resolved here per entity type instead of via a join.
 */
export default async function AdminBitacora() {
  const { supabase } = await getCurrentAdmin();

  const [{ data: eventos }, { data: propiedades }, { data: residentes }, { data: invitaciones }] =
    await Promise.all([
      supabase
        .from("eventos")
        .select("id, tipo, entidad, entidad_id, fecha")
        .order("fecha", { ascending: false })
        .limit(200)
        .returns<EventoRow[]>(),
      supabase.from("propiedades").select("id, numero"),
      supabase.from("residentes").select("id, propiedad_id"),
      supabase.from("invitaciones").select("id, propiedad_id, visitante_nombre"),
    ]);

  const propiedadNumero = new Map((propiedades ?? []).map((p) => [p.id as string, p.numero as string]));
  const residentePropiedad = new Map((residentes ?? []).map((r) => [r.id as string, r.propiedad_id as string]));
  const invitacion = new Map(
    (invitaciones ?? []).map((i) => [i.id as string, { propiedad_id: i.propiedad_id as string, nombre: i.visitante_nombre as string }]),
  );

  function labelFor(row: EventoRow): string {
    switch (row.entidad) {
      case "PROPERTY": {
        const numero = propiedadNumero.get(row.entidad_id);
        return numero ? `Propiedad ${numero}` : "Propiedad —";
      }
      case "RESIDENT": {
        const propiedadId = residentePropiedad.get(row.entidad_id);
        const numero = propiedadId ? propiedadNumero.get(propiedadId) : undefined;
        return numero ? `Propiedad ${numero}` : "Residente —";
      }
      case "INVITATION": {
        const inv = invitacion.get(row.entidad_id);
        const numero = inv ? propiedadNumero.get(inv.propiedad_id) : undefined;
        return inv ? `Propiedad ${numero ?? "—"} · ${inv.nombre}` : "Invitación —";
      }
      case "DEVICE":
        return "Dispositivo";
      case "CONDOMINIUM":
        return "Condominio";
      default:
        return "—";
    }
  }

  return (
    <main>
      <h1>Bitácora</h1>
      <p className="muted">Todos los eventos del condominio, últimos 200.</p>

      {!eventos || eventos.length === 0 ? (
        <div className="empty-state">
          <p>Sin eventos todavía.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Evento</th><th>Propiedad</th></tr>
            </thead>
            <tbody>
              {eventos.map((row) => {
                const b = eventBadge(row.tipo);
                return (
                  <tr key={row.id}>
                    <td className="muted">{fmtDateTime(row.fecha)}</td>
                    <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                    <td>{labelFor(row)}</td>
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
