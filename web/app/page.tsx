import Link from "next/link";

import { fmtDateTime, statusBadge } from "@/lib/format";
import { getCurrentResident } from "@/lib/session";
import { SubmitButton } from "./components/submit-button";
import { NewInvitationForm } from "./new-invitation-form";
import { cancelarInvitacionAction } from "./actions";

// Always render fresh: the in-memory store mutates on every action.
export const dynamic = "force-dynamic";

const FINALIZED = new Set(["EXPIRED", "REMOVED"]);

export default async function Dashboard() {
  const { ctx, resident, propertyId } = await getCurrentResident();
  const invitations = (await ctx.store.invitations.listByProperty(propertyId)).sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );

  return (
    <main>
      <div className="toolbar">
        <div>
          <h1>Mis invitaciones</h1>
          <p className="muted">{resident.nombre} · Casa 1 · Condominio Demo</p>
        </div>
        <Link href="/perfil">Perfil del hogar →</Link>
      </div>

      <section className="panel">
        <h2>Nueva invitación</h2>
        <NewInvitationForm />
      </section>

      <section className="panel">
        <h2>Invitaciones ({invitations.length})</h2>
        {invitations.length === 0 ? (
          <div className="empty-state">
            <p>Aún no has creado invitaciones.</p>
            <p className="muted">Usa el formulario de arriba para crear la primera.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Visitante</th>
                <th>Ventana</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const b = statusBadge(inv.estado);
                return (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/invitaciones/${inv.id}`}>{inv.visitante_nombre}</Link>
                      <div className="muted">{inv.visitante_telefono}</div>
                    </td>
                    <td className="muted">
                      {fmtDateTime(inv.fecha_inicio)} → {fmtDateTime(inv.fecha_fin)}
                    </td>
                    <td>
                      <span className={`badge ${b.tone}`}>{b.label}</span>
                    </td>
                    <td>
                      {!FINALIZED.has(inv.estado) && (
                        <form action={cancelarInvitacionAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <SubmitButton className="btn-circle small danger">Cancelar</SubmitButton>
                        </form>
                      )}
                    </td>
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
