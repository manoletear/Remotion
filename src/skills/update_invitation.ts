import type { Invitation } from "../domain/invitation/index.js";
import { isLoadedOnDevice } from "../domain/invitation/index.js";
import type { InvitationPatch } from "../mcp/supabase/port.js";
import { EntityType, EventType, InvitationStatus } from "../shared/enums.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";
import { Validator, validateValidityWindow } from "../shared/validators.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";

export interface UpdateInvitationInput {
  id: string;
  visitante_nombre?: string;
  visitante_telefono?: string;
  motivo?: string;
  patente?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}

/**
 * Update Invitation skill. Modifies visitor data and/or the validity window.
 *
 * Terminal/removing invitations cannot be edited. Reschedules activation and
 * expiration when the window moves. If the visitor phone changes while the
 * invitation is already ACTIVE on the device, it is flagged back to
 * PENDING_SYNC so the next scheduler tick re-pushes the correct number.
 */
export async function updateInvitation(
  ctx: SkillContext,
  input: UpdateInvitationInput,
): Promise<Invitation> {
  const current = await ctx.store.invitations.get(input.id);
  if (!current) throw new NotFoundError("Invitation", input.id);

  // Only terminal/removing invitations are locked. ERROR is intentionally
  // editable so a resident can correct a bad number/window and let the next
  // RETRY succeed (a phone change re-flags PENDING_SYNC below).
  if (
    current.estado === InvitationStatus.REMOVING ||
    current.estado === InvitationStatus.REMOVED
  ) {
    throw new ValidationError("Invitation can no longer be edited", [
      `estado is ${current.estado}`,
    ]);
  }

  const patch: InvitationPatch = {};
  const v = new Validator();

  if (input.visitante_nombre !== undefined) {
    v.requireNonEmpty(input.visitante_nombre, "visitante_nombre");
    patch.visitante_nombre = input.visitante_nombre.trim();
  }

  // Free-text visit context: an empty string clears the field.
  if (input.motivo !== undefined) patch.motivo = input.motivo.trim() || null;
  if (input.patente !== undefined) patch.patente = input.patente.trim() || null;

  let phoneChanged = false;
  if (input.visitante_telefono !== undefined) {
    const phone = v.phone(input.visitante_telefono, "visitante_telefono");
    if (phone) {
      phoneChanged = phone !== current.visitante_telefono;
      patch.visitante_telefono = phone;
    }
  }
  v.throwIfInvalid("Invalid invitation update");

  const startIso = input.fecha_inicio ?? current.fecha_inicio;
  const endIso = input.fecha_fin ?? current.fecha_fin;
  const windowChanged =
    startIso !== current.fecha_inicio || endIso !== current.fecha_fin;

  if (windowChanged) {
    const { start, end } = validateValidityWindow(startIso, endIso, ctx.now());
    patch.fecha_inicio = start.toISOString();
    patch.fecha_fin = end.toISOString();
  }

  // A phone change on an already-loaded invitation requires a re-sync.
  if (phoneChanged && isLoadedOnDevice(current)) {
    patch.estado = InvitationStatus.PENDING_SYNC;
  }

  const updated = await ctx.store.invitations.update(current.id, patch);

  await auditEvent(ctx, {
    tipo: EventType.INVITATION_UPDATED,
    entidad: EntityType.INVITATION,
    entidad_id: updated.id,
    payload: { changed: Object.keys(patch) },
  });

  if (windowChanged) {
    await ctx.scheduler.schedule("ACTIVATION", updated.id, new Date(updated.fecha_inicio));
    await ctx.scheduler.schedule("EXPIRATION", updated.id, new Date(updated.fecha_fin));
  }

  return updated;
}
