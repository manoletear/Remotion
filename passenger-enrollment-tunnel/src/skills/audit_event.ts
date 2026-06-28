import type { EventType } from "../shared/enums.js";
import type { AuditEvent } from "../mcp/store/port.js";
import type { TunnelContext } from "./context.js";

/**
 * Append an immutable audit record. Every meaningful state change goes through
 * here so the LGPD log is the single source of truth for what happened — and,
 * critically, PII is kept out of the payload (it lives in the ficha row under
 * access control).
 */
export async function auditEvent(
  ctx: TunnelContext,
  input: { tipo: EventType; fichaId: string; payload?: Record<string, unknown> },
): Promise<AuditEvent> {
  return ctx.store.events.append({
    tipo: input.tipo,
    fichaId: input.fichaId,
    payload: input.payload ?? {},
  });
}
