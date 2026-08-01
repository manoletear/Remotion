"use client";

import { useActionState } from "react";

import { SubmitButton } from "../components/submit-button";
import type { ActionState } from "../actions";
import { agregarEmpleadoAction, agregarFamiliarAction, agregarMascotaAction } from "./actions";

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

export function AddMascotaForm() {
  const [state, formAction] = useActionState(agregarMascotaAction, initialState);
  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="mascota_nombre">Nombre</label>
        <input id="mascota_nombre" name="nombre" placeholder="Nombre" required />
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="btn-circle-row">
        <SubmitButton className="btn-circle large success">Agregar mascota</SubmitButton>
      </div>
    </form>
  );
}
