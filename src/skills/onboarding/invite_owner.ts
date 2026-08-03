import type { Resident } from "../../domain/resident/index.js";
import { syncAddPermanent } from "../../orchestration/permanent_access_sync.js";
import { OWNER_INVITATION_EXPIRY_MS } from "../../shared/constants.js";
import { EntityType, EventType, ResidentStatus, ResidentTipo } from "../../shared/enums.js";
import { ValidationError } from "../../shared/errors.js";
import { generateClaimToken, hashClaimToken } from "../../shared/tokens.js";
import { Validator } from "../../shared/validators.js";
import { auditEvent } from "../audit_event.js";
import type { SkillContext } from "../context.js";

export interface InviteOwnerInput {
  propiedad_id: string;
  nombre: string;
  /**
   * Required, not "phone or email" as originally scoped in spec.md's
   * Assumptions — `residentes.telefono` is NOT NULL and is the RTU's own
   * authorization identity (Constitution I: the RTU authorizes callers by
   * phone number, nothing else). An owner record with no phone could never
   * actually get gate access, which is this row's entire purpose. Discovered
   * while wiring this skill to `syncAddPermanent`, not assumed up front.
   */
  telefono: string;
  /** Optional additional delivery channel for the invitation itself. */
  email: string | null;
  /**
   * Base URL the claim link is appended to (e.g.
   * "https://condogate-ten.vercel.app/reclamar") — supplied by the caller
   * because only the web layer knows its own deployed origin (research.md /
   * plan.md: the domain package stays deployment-agnostic).
   */
  claimBaseUrl: string;
}

export type InviteOwnerResult = { invitationId: string } | { skipped: true };

/**
 * Invite Owner skill (specs/005-owner-onboarding, US1).
 *
 * Caller MUST already be authorized as an admin for `propiedad_id`'s
 * condominium — this skill does not re-check that itself, the same division
 * of responsibility every other skill already has (the web layer's
 * `getCurrentAdmin()` plus RLS are the enforcement points).
 *
 * No-ops (returns `{ skipped: true }`, not an error) if the contact already
 * resolves to an existing resident anywhere in reach of the caller's RLS
 * scope — FR-012: an admin must never be able to tell a "brand new contact"
 * invite apart from an "already registered" one.
 */
export async function inviteOwner(
  ctx: SkillContext,
  invitedBy: string,
  input: InviteOwnerInput,
): Promise<InviteOwnerResult> {
  const v = new Validator();
  v.requireNonEmpty(input.nombre, "nombre");
  const phone = v.phone(input.telefono, "telefono");
  const email = input.email ? v.email(input.email, "email") : null;
  v.throwIfInvalid("Invalid owner invitation");

  const existing = await ctx.store.residents.findByPhone(phone!);
  if (existing) {
    // Already claimed by a real auth account: FR-012 — do not reveal that to
    // the admin, no-op with the same success shape as a brand-new invite.
    if (await ctx.store.profiles.isLinked(existing.id)) return { skipped: true };
    // Still pending (never claimed): this is a re-invite of the same owner,
    // not a duplicate — send a fresh link, `ownerInvitations.create` handles
    // invalidating the previous one (US2 Scenario 3 / research.md).
    await auditEvent(ctx, {
      tipo: EventType.OWNER_INVITATION_INVALIDATED,
      entidad: EntityType.RESIDENT,
      entidad_id: existing.id,
      payload: {},
    });
    return sendInvitationFor(ctx, existing, invitedBy, { email, claimBaseUrl: input.claimBaseUrl });
  }

  const resident = await ctx.store.residents.create({
    propiedad_id: input.propiedad_id,
    nombre: input.nombre.trim(),
    telefono: phone!,
    tipo: ResidentTipo.RESIDENT,
    estado: ResidentStatus.PENDING_SYNC,
  });

  // Real gate access is granted immediately, independent of the web claim
  // (research.md — mirrors addFamilyMember/addEmployee's existing behavior).
  await syncAddPermanent(ctx, resident.id);

  return sendInvitationFor(ctx, resident, invitedBy, { email, claimBaseUrl: input.claimBaseUrl });
}

async function sendInvitationFor(
  ctx: SkillContext,
  resident: Resident,
  invitedBy: string,
  input: { email: string | null; claimBaseUrl: string },
): Promise<InviteOwnerResult> {
  const rawToken = generateClaimToken();
  const expiresAt = new Date(ctx.now().getTime() + OWNER_INVITATION_EXPIRY_MS).toISOString();
  const invitation = await ctx.store.ownerInvitations.create(
    {
      resident_id: resident.id,
      channel_email: input.email,
      channel_phone: resident.telefono,
      invited_by: invitedBy,
    },
    hashClaimToken(rawToken),
    expiresAt,
  );

  await sendInvitation(ctx, resident, {
    phone: resident.telefono,
    email: input.email,
    claimUrl: `${input.claimBaseUrl}/${rawToken}`,
  });

  await auditEvent(ctx, {
    tipo: EventType.OWNER_INVITED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { invitationId: invitation.id },
  });

  return { invitationId: invitation.id };
}

async function sendInvitation(
  ctx: SkillContext,
  resident: Resident,
  input: { phone: string | null; email: string | null; claimUrl: string },
): Promise<void> {
  const title = "Invitación a CondoGATE";
  const body = `Hola ${resident.nombre}, te invitaron a administrar tu acceso al portón. Activa tu cuenta aquí: ${input.claimUrl}`;

  const attempts: Promise<void>[] = [];
  if (input.phone) attempts.push(ctx.notifier.notify({ channel: "SMS", to: input.phone, title, body }));
  if (input.email) attempts.push(ctx.notifier.notify({ channel: "EMAIL", to: input.email, title, body }));

  const results = await Promise.allSettled(attempts);
  if (results.length > 0 && results.every((r) => r.status === "rejected")) {
    throw new ValidationError("Owner invitation could not be delivered", [
      "every configured delivery channel failed",
    ]);
  }
}
