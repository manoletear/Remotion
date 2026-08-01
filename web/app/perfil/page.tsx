import { ResidentTipo } from "gsm-gate-access-layer";

import { statusBadge } from "@/lib/format";
import { getCurrentResident } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import { SubmitButton } from "../components/submit-button";
import { removerMascotaAction, removerMiembroAction } from "./actions";
import { AddEmpleadoForm, AddFamiliarForm, AddMascotaForm } from "./perfil-forms";
import { PetPhotoUpload } from "./pet-photo-upload";

export const dynamic = "force-dynamic";

const FINALIZED = new Set(["REMOVED"]);

export default async function Perfil() {
  const { ctx, propertyId } = await getCurrentResident();

  const residents = await ctx.store.residents.listByProperty(propertyId);
  const familiares = residents.filter((r) => r.tipo === ResidentTipo.FAMILIAR);
  const empleados = residents.filter((r) => r.tipo === ResidentTipo.EMPLEADO);
  const mascotas = await ctx.store.pets.listByProperty(propertyId);

  // Private bucket — short-lived signed URLs for display, not public paths.
  const service = createServiceClient();
  const petPhotos = new Map<string, string>();
  for (const pet of mascotas) {
    if (!pet.foto_path) continue;
    const { data } = await service.storage
      .from("mascotas-fotos")
      .createSignedUrl(pet.foto_path, 60 * 5);
    if (data?.signedUrl) petPhotos.set(pet.id, data.signedUrl);
  }

  return (
    <main>
      <p className="muted"><a href="/">← Mis invitaciones</a></p>
      <h1>Perfil del hogar</h1>
      <p className="muted">
        Familiares y empleados aquí quedan con acceso permanente real al portón. Las
        mascotas son solo informativas.
      </p>

      <section className="panel">
        <h2>Familiares ({familiares.length})</h2>
        {familiares.length === 0 ? (
          <div className="empty-state">
            <p>Aún no has agregado familiares.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Teléfono</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {familiares.map((r) => {
                const b = statusBadge(r.estado);
                return (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td className="muted">{r.telefono}</td>
                    <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                    <td>
                      {!FINALIZED.has(r.estado) && (
                        <form action={removerMiembroAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton className="btn-circle small danger">Quitar</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <AddFamiliarForm />
      </section>

      <section className="panel">
        <h2>Empleados domésticos ({empleados.length})</h2>
        {empleados.length === 0 ? (
          <div className="empty-state">
            <p>Aún no has agregado empleados.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Teléfono</th><th>Patente</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {empleados.map((r) => {
                const b = statusBadge(r.estado);
                return (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td className="muted">{r.telefono}</td>
                    <td className="muted">{r.patente ?? "—"}</td>
                    <td><span className={`badge ${b.tone}`}>{b.label}</span></td>
                    <td>
                      {!FINALIZED.has(r.estado) && (
                        <form action={removerMiembroAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton className="btn-circle small danger">Quitar</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <AddEmpleadoForm />
      </section>

      <section className="panel">
        <h2>Mascotas ({mascotas.length})</h2>
        {mascotas.length === 0 ? (
          <div className="empty-state">
            <p>Aún no has agregado mascotas.</p>
          </div>
        ) : (
          <div className="pet-gallery">
            {mascotas.map((pet) => (
              <div key={pet.id} className="pet-card">
                {petPhotos.has(pet.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={petPhotos.get(pet.id)} alt={pet.nombre} className="pet-photo" />
                ) : (
                  <div className="pet-photo pet-photo-empty" aria-hidden="true" />
                )}
                <p>{pet.nombre}</p>
                <PetPhotoUpload petId={pet.id} />
                <form action={removerMascotaAction}>
                  <input type="hidden" name="id" value={pet.id} />
                  <SubmitButton className="ghost">Quitar</SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
        <AddMascotaForm />
      </section>
    </main>
  );
}
