import type { Invitation } from "../domain/invitation/index.js";
import { syncRemoveAccess } from "../orchestration/rtu_sync.js";
import { EntityType, EventType, InvitationStatus } from "../shared/enums.js";
import { NotFoundError } from "../shared/errors.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";

/**
 * Expire Invitation skill. Fires when the validity window ends. Records the
 * EXPIRED milestone (when the invitation was actually active) and removes the
 * access from the device. Idempotent: a REMOVED invitation is returned as-is.
 */
export async function expireInvitation(
  ctx: SkillContext,
  invitationId: string,
): Promise<Invitation> {
  const inv = await ctx.store.invitations.get(invitationId);
  if (!inv) throw new NotFoundError("Invitation", invitationId);
  // Idempotent: nothing to do if already finalized or a removal is in flight.
  if (
    inv.estado === InvitationStatus.REMOVED ||
    inv.estado === InvitationStatus.EXPIRED ||
    inv.estado === InvitationStatus.REMOVING
  ) {
    return inv;
  }

  // The EXPIRED milestone only applies when the access was actually loaded.
  if (inv.estado === InvitationStatus.ACTIVE) {
    await ctx.store.invitations.update(inv.id, { estado: InvitationStatus.EXPIRED });
  }

  await auditEvent(ctx, {
    tipo: EventType.INVITATION_EXPIRED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { fecha_fin: inv.fecha_fin },
  });

  await ctx.scheduler.cancel(inv.id);
  return syncRemoveAccess(ctx, inv.id);
}
