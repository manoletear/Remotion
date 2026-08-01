import type { Resident } from "../../domain/resident/index.js";
import { syncRemovePermanent } from "../../orchestration/permanent_access_sync.js";
import { ResidentStatus, ResidentTipo } from "../../shared/enums.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import type { SkillContext } from "../context.js";

/**
 * Remove Household Member skill (specs/003-household-permanent-access, US4).
 *
 * Mirrors `cancelInvitation`'s shape: idempotent on an already-removed or
 * in-flight removal. Only `FAMILIAR`/`EMPLEADO` rows are removable this way —
 * the primary `RESIDENT` row is the account owner, out of this feature's scope.
 */
export async function removeHouseholdMember(
  ctx: SkillContext,
  residentId: string,
): Promise<Resident> {
  const resident = await ctx.store.residents.get(residentId);
  if (!resident) throw new NotFoundError("Resident", residentId);

  if (resident.tipo === ResidentTipo.RESIDENT) {
    throw new ValidationError("Cannot remove the primary resident", [
      "only FAMILIAR/EMPLEADO rows can be removed through this skill",
    ]);
  }

  if (
    resident.estado === ResidentStatus.REMOVED ||
    resident.estado === ResidentStatus.REMOVING
  ) {
    return resident;
  }

  return syncRemovePermanent(ctx, residentId);
}
