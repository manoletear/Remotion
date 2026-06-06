import type { Event } from "../domain/event/index.js";
import type { EntityType, EventType } from "../shared/enums.js";
import type { SkillContext } from "./context.js";

export interface AuditEventInput {
  tipo: EventType;
  entidad: EntityType;
  entidad_id: string;
  payload?: Record<string, unknown>;
}

/**
 * Audit Event skill. Appends an immutable record to the event log. Every other
 * skill calls this after a meaningful state change so the system has a complete
 * operational trail (bitacora).
 */
export async function auditEvent(
  ctx: SkillContext,
  input: AuditEventInput,
): Promise<Event> {
  return ctx.store.events.append({
    tipo: input.tipo,
    entidad: input.entidad,
    entidad_id: input.entidad_id,
    payload: input.payload ?? {},
  });
}
