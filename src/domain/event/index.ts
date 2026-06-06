import { EntityType, EventType } from "../../shared/enums.js";

/** An immutable, auditable record of something that happened in the system. */
export interface Event {
  id: string;
  tipo: EventType;
  entidad: EntityType;
  /** Identifier of the entity instance the event refers to. */
  entidad_id: string;
  /** Arbitrary structured context for the event. */
  payload: Record<string, unknown>;
  fecha: string;
}

export type NewEvent = Pick<
  Event,
  "tipo" | "entidad" | "entidad_id"
> &
  Partial<Pick<Event, "payload">>;
