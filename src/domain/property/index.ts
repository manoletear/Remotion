/** A house, plot or unit within a condominium. */
export interface Property {
  id: string;
  numero: string;
  condominio_id: string;
  created_at: string;
}

export type NewProperty = Pick<Property, "numero" | "condominio_id">;
