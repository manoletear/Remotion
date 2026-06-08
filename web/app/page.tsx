import Link from "next/link";

import { fmtDateTime, localInputValue, statusBadge } from "@/lib/format";
import { getCurrentResident } from "@/lib/session";
import {
  cancelarInvitacionAction,
  crearInvitacionAction,
  procesarCicloAction,
} from "./actions";

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
        <form action={procesarCicloAction}>
          <button className="ghost" type="submit">Procesar ciclo ▸</button>
        </form>
      </div>

      <section className="panel">
        <h2>Nueva invitación</h2>
        <form action={crearInvitacionAction}>
          <div className="grid2">
            <div className="field">
              <label htmlFor="nombre">Visitante</label>
              <input id="nombre" name="nombre" placeholder="Nombre" required />
            </div>
            <div className="field">
              <label htmlFor="telefono">Teléfono</label>
              <input id="telefono" name="telefono" placeholder="+56 9 1111 2222" required />
            </div>
            <div className="field">
              <label htmlFor="inicio">Desde</label>
              <input id="inicio" name="inicio" type="datetime-local" defaultValue={localInputValue(0)} required />
            </div>
            <div className="field">
              <label htmlFor="fin">Hasta</label>
              <input id="fin" name="fin" type="datetime-local" defaultValue={localInputValue(2)} required />
            </div>
          </div>
          <button type="submit">Crear invitación</button>
        </form>
      </section>

      <section className="panel">
        <h2>Invitaciones ({invitations.length})</h2>
        {invitations.length === 0 ? (
          <p className="muted">Aún no has creado invitaciones.</p>
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
                      <span className="badge" style={{ background: b.bg, color: b.fg }}>
                        {b.label}
                      </span>
                    </td>
                    <td>
                      {!FINALIZED.has(inv.estado) && (
                        <form action={cancelarInvitacionAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button className="ghost" type="submit">Cancelar</button>
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
