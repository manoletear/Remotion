import { EntityType, EventType } from "../../shared/enums.js";
import { hashClaimToken } from "../../shared/tokens.js";
import { auditEvent } from "../audit_event.js";
import type { SkillContext } from "../context.js";

export type ClaimInvitationResult =
  | { residentId: string; propiedadId: string }
  | { error: "not_found" | "expired" | "already_used" };

/**
 * Claim Invitation skill (specs/005-owner-onboarding, US1/US2).
 *
 * Runs under a service-role context — the caller has no `perfiles` row yet,
 * so none of the RLS scope helpers resolve for them (research.md's documented
 * exception to Constitution V). Every scope fact is re-derived here from the
 * token itself, nothing is trusted from the caller beyond `rawToken` and
 * `claimedByAuthUserId` (the just-authenticated Supabase Auth user id).
 */
export async function claimInvitation(
  ctx: SkillContext,
  rawToken: string,
  claimedByAuthUserId: string,
): Promise<ClaimInvitationResult> {
  const tokenHash = hashClaimToken(rawToken);
  const invitation = await ctx.store.ownerInvitations.findByTokenHash(tokenHash);
  if (!invitation) return { error: "not_found" };

  const now = ctx.now().toISOString();
  if (invitation.expires_at <= now) return { error: "expired" };

  const claimed = await ctx.store.ownerInvitations.claim(invitation.id, claimedByAuthUserId, now);
  if (!claimed) return { error: "already_used" };

  const resident = await ctx.store.residents.get(claimed.resident_id);
  if (!resident) return { error: "not_found" };

  await ctx.store.profiles.linkResident(claimedByAuthUserId, resident.id);

  await auditEvent(ctx, {
    tipo: EventType.OWNER_INVITATION_CLAIMED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { invitationId: claimed.id },
  });

  return { residentId: resident.id, propiedadId: resident.propiedad_id };
}
