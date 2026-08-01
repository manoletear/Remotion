import Link from "next/link";
import type { Event } from "gsm-gate-access-layer";

import { eventBadge, fmtDateTime } from "@/lib/format";
import { getCurrentResident } from "@/lib/session";
import { SettingsGear } from "../components/settings-gear";

export const dynamic = "force-dynamic";

/**
 * Entry/exit history for the whole household — a read-only view over events
 * already recorded by the invitation/permanent-access sync engines
 * (RTU_SYNC_SUCCESS, INVITATION_ACTIVATED, etc.), not a new backend concept.
 * Merges events for the property itself, every resident on it (family and
 * employees included, not just the logged-in account), and every invitation.
 */
export default async function Historial() {
  const { ctx, propertyId } = await getCurrentResident();

  const [residents, invitations, propertyEvents] = await Promise.all([
    ctx.store.residents.listByProperty(propertyId),
    ctx.store.invitations.listByProperty(propertyId),
    ctx.store.events.listForEntity(propertyId, 50),
  ]);

  const residentName = new Map(residents.map((r) => [r.id, r.nombre]));
  const invitationName = new Map(invitations.map((i) => [i.id, i.visitante_nombre]));

  const residentEvents = (
    await Promise.all(residents.map((r) => ctx.store.events.listForEntity(r.id, 50)))
  ).flat();
  const invitationEvents = (
    await Promise.all(invitations.map((i) => ctx.store.events.listForEntity(i.id, 50)))
  ).flat();

  const events = [...propertyEvents, ...residentEvents, ...invitationEvents].sort((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );

  function labelFor(e: Event): string {
    if (residentName.has(e.entidad_id)) return residentName.get(e.entidad_id)!;
    if (invitationName.has(e.entidad_id)) return invitationName.get(e.entidad_id)!;
    if (e.entidad_id === propertyId) return "Propiedad";
    return "—";
  }

  return (
    <main>
      <div className="toolbar">
        <div>
          <p className="muted"><Link href="/">← Invitaciones enviadas</Link></p>
          <h1>Historial de entradas y salidas</h1>
        </div>
        <SettingsGear />
      </div>

      <section className="panel">
        {events.length === 0 ? (
          <div className="empty-state">
            <p>Sin movimientos todavía.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Fecha</th><th>Evento</th><th>Quién</th></tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const b = eventBadge(e.tipo);
                return (
                  <tr key={e.id}>
                    <td className="muted">{fmtDateTime(e.fecha)}</td>
                    <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                    <td>{labelFor(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
