/** A permanent authorized user attached to a property. */
export interface Resident {
  id: string;
  propiedad_id: string;
  nombre: string;
  /** E.164 phone number. */
  telefono: string;
  created_at: string;
}

export type NewResident = Pick<Resident, "propiedad_id" | "nombre" | "telefono">;
