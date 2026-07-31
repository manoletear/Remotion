import Link from "next/link";
import { notFound } from "next/navigation";

import { fmtDateTime, statusBadge } from "@/lib/format";
import { getCurrentResident } from "@/lib/session";
import { SubmitButton } from "../../components/submit-button";
import { cancelarInvitacionAction } from "../../actions";

export const dynamic = "force-dynamic";

const FINALIZED = new Set(["EXPIRED", "REMOVED"]);

export default async function InvitationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, propertyId } = await getCurrentResident();

  const inv = await ctx.store.invitations.get(id);
  // Not found OR belongs to another property -> 404 (don't leak existence).
  if (!inv || inv.propiedad_id !== propertyId) notFound();

  const eventos = await ctx.store.events.listForEntity(id);
  const b = statusBadge(inv.estado);

  return (
    <main>
      <p className="muted"><Link href="/">← Mis invitaciones</Link></p>

      <div className="toolbar">
        <div>
          <h1>{inv.visitante_nombre}</h1>
          <p className="muted">{inv.visitante_telefono}</p>
        </div>
        <span className={`badge ${b.tone}`}>{b.label}</span>
      </div>

      <section className="panel">
        <h2>Detalle</h2>
        <table>
          <tbody>
            <tr><th>Desde</th><td>{fmtDateTime(inv.fecha_inicio)}</td></tr>
            <tr><th>Hasta</th><td>{fmtDateTime(inv.fecha_fin)}</td></tr>
            <tr><th>Slot RTU</th><td>{inv.rtu_slot ?? "—"}</td></tr>
            {inv.last_error && <tr><th>Último error</th><td>{inv.last_error}</td></tr>}
          </tbody>
        </table>
        {!FINALIZED.has(inv.estado) && (
          <form action={cancelarInvitacionAction} className="btn-circle-row">
            <input type="hidden" name="id" value={inv.id} />
            <SubmitButton className="btn-circle large danger">Cancelar invitación</SubmitButton>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Bitácora</h2>
        {eventos.length === 0 ? (
          <p className="muted">Sin eventos.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Evento</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td>{e.tipo}</td>
                  <td className="muted">{fmtDateTime(e.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
