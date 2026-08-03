"use client";

import { useActionState, useRef, useState } from "react";

import { SubmitButton } from "../../components/submit-button";
import { invitarPropietarioAction, type InviteOwnerActionState } from "./actions";

const initialState: InviteOwnerActionState = {};

// Contact Picker API is Android Chrome-only as of this writing (research.md,
// specs/005-owner-onboarding US3) — feature-detected so the button is simply
// absent everywhere else, never present-but-broken (FR-011).
type ContactAddress = { name?: string[]; tel?: string[] };
type ContactsManager = {
  select: (
    props: string[],
    opts?: { multiple?: boolean },
  ) => Promise<ContactAddress[]>;
};

function getContactsManager(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  if (!("contacts" in navigator) || !("ContactsManager" in window)) return null;
  return (navigator as unknown as { contacts: ContactsManager }).contacts;
}

export function InviteOwnerForm({
  propiedades,
}: {
  propiedades: { id: string; numero: string }[];
}) {
  const [state, formAction] = useActionState(invitarPropietarioAction, initialState);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const contacts = useRef(getContactsManager());

  async function pickContact() {
    const manager = contacts.current;
    if (!manager) return;
    const [contact] = await manager.select(["name", "tel"], { multiple: false });
    if (!contact) return;
    if (contact.name?.[0]) setNombre(contact.name[0]);
    if (contact.tel?.[0]) setTelefono(contact.tel[0]);
  }

  return (
    <form action={formAction} className="panel">
      <h2>Invitar propietario</h2>

      <div className="grid2">
        <div className="field">
          <label htmlFor="propiedad_id">Propiedad</label>
          <select id="propiedad_id" name="propiedad_id" required>
            {propiedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nombre">Nombre</label>
          <input
            id="nombre"
            name="nombre"
            placeholder="Nombre del propietario"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="telefono">Teléfono</label>
          <input
            id="telefono"
            name="telefono"
            placeholder="+56 9 1111 2222"
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email (opcional)</label>
          <input id="email" name="email" type="email" placeholder="propietario@correo.cl" />
        </div>
      </div>

      {contacts.current && (
        <button type="button" className="ghost" onClick={pickContact}>
          Elegir de contactos
        </button>
      )}

      {state.error && <p className="field-error">{state.error}</p>}
      {state.success && <p className="muted">Invitación enviada.</p>}

      <div className="btn-circle-row">
        <SubmitButton className="btn-circle large success">Invitar</SubmitButton>
      </div>
    </form>
  );
}
