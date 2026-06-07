import type { Invitation } from "../domain/invitation/index.js";
import { syncRemoveAccess } from "../orchestration/rtu_sync.js";
import { EntityType, EventType, InvitationStatus } from "../shared/enums.js";
import { NotFoundError } from "../shared/errors.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";
import { notifyVisitor } from "./notify.js";

/**
 * Cancel Invitation skill. Revokes access ahead of schedule. Cancels pending
 * scheduler jobs, records the cancellation, and removes the access from the
 * device (or closes it out if it was never loaded). Idempotent on REMOVED.
 */
export async function cancelInvitation(
  ctx: SkillContext,
  invitationId: string,
): Promise<Invitation> {
  const inv = await ctx.store.invitations.get(invitationId);
  if (!inv) throw new NotFoundError("Invitation", invitationId);
  // Idempotent: a removal already finished (REMOVED) or in flight (REMOVING)
  // needs no further action. ERROR is allowed to proceed because ERROR -> REMOVING
  // is a valid transition and re-drives the removal.
  if (
    inv.estado === InvitationStatus.REMOVED ||
    inv.estado === InvitationStatus.REMOVING
  ) {
    return inv;
  }

  await ctx.scheduler.cancel(inv.id);
  // Mark intent so a failed removal is re-driven toward removal, not re-added.
  await ctx.store.invitations.update(inv.id, { cancelled: true });

  await auditEvent(ctx, {
    tipo: EventType.INVITATION_CANCELLED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { previous_estado: inv.estado },
  });

  await notifyVisitor(ctx, inv, "Acceso cancelado", "Tu acceso al portón fue cancelado.");
  return syncRemoveAccess(ctx, inv.id);
}
