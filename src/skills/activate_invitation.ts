import type { Invitation } from "../domain/invitation/index.js";
import { syncAddAccess } from "../orchestration/rtu_sync.js";
import type { SkillContext } from "./context.js";

/**
 * Activate Invitation skill. Synchronizes the access onto the RTU. Thin wrapper
 * over the sync engine so the scheduler (or a manual retry) can invoke it by id.
 */
export async function activateInvitation(
  ctx: SkillContext,
  invitationId: string,
): Promise<Invitation> {
  return syncAddAccess(ctx, invitationId);
}
