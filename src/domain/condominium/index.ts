import { CondominiumStatus } from "../../shared/enums.js";

/** A managed community. Root of the access-control hierarchy. */
export interface Condominium {
  id: string;
  nombre: string;
  estado: CondominiumStatus;
  created_at: string;
}

export type NewCondominium = Pick<Condominium, "nombre"> &
  Partial<Pick<Condominium, "estado">>;
