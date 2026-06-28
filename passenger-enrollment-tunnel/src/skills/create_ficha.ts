import type { Ficha } from "../domain/ficha/index.js";
import { EventType } from "../shared/enums.js";
import { ValidationError } from "../shared/errors.js";
import { auditEvent } from "./audit_event.js";
import type { TunnelContext } from "./context.js";

export interface CreateFichaInput {
  /** PMS reservation locator. */
  reservaLocalizador: string;
  /** Where to deliver the pre-check-in link (E.164 phone or email). */
  contactoTitular: string;
}

/**
 * Create Ficha skill — triggered by a "reservation created/modified" PMS event.
 *
 * Persists the ficha in DRAFT and records the audit event. Delivering the
 * pre-check-in link (WhatsApp/SMS/email) is a separate concern handled by the
 * messaging adapter, keeping this write path fast and side-effect-light — the
 * same separation the Access Layer keeps between create and device sync.
 */
export async function createFicha(
  ctx: TunnelContext,
  input: CreateFichaInput,
): Promise<Ficha> {
  const issues: string[] = [];
  if (!input.reservaLocalizador?.trim()) issues.push("reservaLocalizador vacío");
  if (!input.contactoTitular?.trim()) issues.push("contactoTitular vacío");
  if (issues.length) throw new ValidationError("Ficha inválida", issues);

  const ficha = await ctx.store.fichas.create({
    reservaLocalizador: input.reservaLocalizador.trim(),
    contactoTitular: input.contactoTitular.trim(),
  });

  await auditEvent(ctx, {
    tipo: EventType.FICHA_CREATED,
    fichaId: ficha.id,
    // No PII in the trail: the locator is enough to correlate.
    payload: { reservaLocalizador: ficha.reservaLocalizador },
  });

  return ficha;
}
