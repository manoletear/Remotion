/** A permanent authorized user attached to a property. */
export interface Resident {
  id: string;
  propiedad_id: string;
  nombre: string;
  /** E.164 phone number. */
  telefono: string;
  /** Optional family/last name (salvaged Condogate `User.familyName`). */
  apellido: string | null;
  /** Optional avatar image URL (salvaged `User.avatarUrl`). */
  avatar_url: string | null;
  created_at: string;
}

export type NewResident = Pick<Resident, "propiedad_id" | "nombre" | "telefono"> &
  Partial<Pick<Resident, "apellido" | "avatar_url">>;
