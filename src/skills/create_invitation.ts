import type { Invitation } from "../domain/invitation/index.js";
import { EntityType, EventType } from "../shared/enums.js";
import { NotFoundError } from "../shared/errors.js";
import { Validator, validateValidityWindow } from "../shared/validators.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";

export interface CreateInvitationInput {
  propiedad_id: string;
  visitante_nombre: string;
  visitante_telefono: string;
  fecha_inicio: string;
  fecha_fin: string;
}

/**
 * Create Invitation skill.
 *
 * Validates the request, persists the invitation in CREATED, records the audit
 * event, and schedules its activation (window start) and expiration (window
 * end). The scheduler — not this call — later drives the RTU sync, keeping the
 * write path fast and the device interaction asynchronous.
 */
export async function createInvitation(
  ctx: SkillContext,
  input: CreateInvitationInput,
): Promise<Invitation> {
  const v = new Validator();
  v.requireNonEmpty(input.visitante_nombre, "visitante_nombre");
  const phone = v.phone(input.visitante_telefono, "visitante_telefono");
  v.throwIfInvalid("Invalid invitation");

  const { start, end } = validateValidityWindow(
    input.fecha_inicio,
    input.fecha_fin,
    ctx.now(),
  );

  const property = await ctx.store.properties.get(input.propiedad_id);
  if (!property) throw new NotFoundError("Property", input.propiedad_id);

  const invitation = await ctx.store.invitations.create({
    propiedad_id: input.propiedad_id,
    visitante_nombre: input.visitante_nombre.trim(),
    visitante_telefono: phone!,
    fecha_inicio: start.toISOString(),
    fecha_fin: end.toISOString(),
  });

  await auditEvent(ctx, {
    tipo: EventType.INVITATION_CREATED,
    entidad: EntityType.INVITATION,
    entidad_id: invitation.id,
    payload: { propiedad_id: invitation.propiedad_id, visitante_telefono: phone },
  });

  await ctx.scheduler.schedule("ACTIVATION", invitation.id, start);
  await ctx.scheduler.schedule("EXPIRATION", invitation.id, end);

  return invitation;
}
