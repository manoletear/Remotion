"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "../components/submit-button";
import type { ActionState } from "../actions";
import { agregarEmpleadoAction, agregarFamiliarAction } from "./actions";

const initialState: ActionState = {};

export function AddFamiliarForm() {
  const [state, formAction] = useActionState(agregarFamiliarAction, initialState);
  return (
    <form action={formAction}>
      <div className="grid2">
        <div className="field">
          <label htmlFor="familiar_nombre">Nombre</label>
          <input id="familiar_nombre" name="nombre" placeholder="Nombre" required />
        </div>
        <div className="field">
          <label htmlFor="familiar_telefono">Teléfono</label>
          <input
            id="familiar_telefono"
            name="telefono"
            placeholder="+56 9 1111 2222"
            required
          />
        </div>
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="btn-circle-row">
        <SubmitButton className="btn-circle large success">Agregar familiar</SubmitButton>
      </div>
    </form>
  );
}

export function AddEmpleadoForm() {
  const [state, formAction] = useActionState(agregarEmpleadoAction, initialState);
  return (
    <form action={formAction}>
      <div className="grid2">
        <div className="field">
          <label htmlFor="empleado_nombre">Nombre</label>
          <input id="empleado_nombre" name="nombre" placeholder="Nombre" required />
        </div>
        <div className="field">
          <label htmlFor="empleado_telefono">Teléfono</label>
          <input
            id="empleado_telefono"
            name="telefono"
            placeholder="+56 9 1111 2222"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="empleado_rut">RUT</label>
          <input id="empleado_rut" name="rut" placeholder="12.345.678-5" required />
        </div>
        <div className="field">
          <label htmlFor="empleado_patente">Patente (opcional)</label>
          <input id="empleado_patente" name="patente" placeholder="ABCD12" />
        </div>
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="btn-circle-row">
        <SubmitButton className="btn-circle large success">Agregar empleado</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Add a pet and its photo together, one submit (research.md: creating and
 * photographing a pet is one moment for the resident, not two). A plain
 * fetch to a Route Handler, not a server action bound via useActionState —
 * Next.js server actions cap request bodies at 1MB, too small for the photo.
 */
export function AddMascotaForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pets", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo agregar la mascota.");
        return;
      }
      if (data.warning) {
        setError(`Mascota agregada, pero no se pudo subir la foto: ${data.warning}`);
      }
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("No se pudo agregar la mascota. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <div className="grid2">
        <div className="field">
          <label htmlFor="mascota_nombre">Nombre</label>
          <input id="mascota_nombre" name="nombre" placeholder="Nombre" required />
        </div>
        <div className="field">
          <label htmlFor="mascota_foto">Foto (opcional)</label>
          <input id="mascota_foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="btn-circle-row">
        <button type="submit" className={`btn-circle large success${busy ? " busy" : ""}`} disabled={busy}>
          Agregar mascota
        </button>
      </div>
    </form>
  );
}
