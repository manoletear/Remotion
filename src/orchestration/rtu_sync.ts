import type { Device } from "../domain/device/index.js";
import type { Invitation } from "../domain/invitation/index.js";
import {
  assertTransition,
  canTransition,
} from "../domain/invitation/index.js";
import { RTU5024, RTU_SYNC_RETRY } from "../shared/constants.js";
import {
  EntityType,
  EventType,
  InvitationStatus,
  RtuOperation,
  RtuResultStatus,
} from "../shared/enums.js";
import type { InvitationPatch } from "../mcp/supabase/port.js";
import { NotFoundError, RtuSyncError } from "../shared/errors.js";
import { withRetry } from "../shared/utils.js";
import { auditEvent } from "../skills/audit_event.js";
import type { SkillContext } from "../skills/context.js";
import { rtuAddUser } from "../skills/rtu_add_user.js";
import { rtuQueryUser } from "../skills/rtu_query_user.js";
import { rtuRemoveUser } from "../skills/rtu_remove_user.js";

/** Persist a validated status transition and return the new row. */
async function transition(
  ctx: SkillContext,
  inv: Invitation,
  to: InvitationStatus,
  patch: InvitationPatch = {},
): Promise<Invitation> {
  assertTransition(inv.estado, to);
  return ctx.store.invitations.update(inv.id, { ...patch, estado: to });
}

/** Lowest free invitation slot on a device, or throw when the phonebook is full. */
async function assignSlot(ctx: SkillContext, device: Device): Promise<number> {
  const occupied = new Set(await ctx.store.invitations.occupiedSlots(device.id));
  for (let slot = RTU5024.INVITATION_SLOT_START; slot <= RTU5024.MAX_SLOTS; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  throw new RtuSyncError("No free RTU slot available", { deviceId: device.id });
}

/** Resolve the device serving an invitation's property, or throw. */
async function resolveDevice(ctx: SkillContext, inv: Invitation): Promise<Device> {
  const device = await ctx.store.devices.getForProperty(inv.propiedad_id);
  if (!device) {
    throw new RtuSyncError("No device serves this property", {
      propiedad_id: inv.propiedad_id,
    });
  }
  return device;
}

/**
 * Push an invitation onto the RTU (PERMISO -> ACTIVACION -> DISPOSITIVO).
 *
 * Idempotent and retry-safe: only acts on CREATED/PENDING_SYNC/ERROR
 * invitations, assigns a stable phonebook slot, retries the SMS command with
 * exponential backoff, and lands the invitation in ACTIVE or ERROR. Emits the
 * RTU_SYNC_* trail plus INVITATION_ACTIVATED on success.
 */
export async function syncAddAccess(
  ctx: SkillContext,
  invitationId: string,
): Promise<Invitation> {
  let inv = await ctx.store.invitations.get(invitationId);
  if (!inv) throw new NotFoundError("Invitation", invitationId);

  const actionable = [
    InvitationStatus.CREATED,
    InvitationStatus.PENDING_SYNC,
    InvitationStatus.ERROR,
  ];
  if (!actionable.includes(inv.estado)) return inv; // nothing to do

  const device = await resolveDevice(ctx, inv);
  if (inv.estado !== InvitationStatus.PENDING_SYNC) {
    inv = await transition(ctx, inv, InvitationStatus.PENDING_SYNC);
  }

  const slot = inv.rtu_slot ?? (await assignSlot(ctx, device));
  const visitorPhone = inv.visitante_telefono;

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { operation: RtuOperation.ADD_USER, slot, deviceId: device.id },
  });

  try {
    const result = await withRetry(
      async () => {
        const r = await rtuAddUser(ctx, {
          device,
          phone: visitorPhone,
          slot,
        });
        if (r.status !== RtuResultStatus.SUCCESS) {
          throw new RtuSyncError(`RTU add failed: ${r.status}`, { reply: r.rawReply });
        }
        return r;
      },
      ctx.syncRetry,
    );

    // Optionally confirm the operation actually took effect on the device by
    // reading back its authorized list (the doc's "Confirmar operaciones").
    if (ctx.verifyAfterSync) {
      const check = await rtuQueryUser(ctx, { device, phone: inv.visitante_telefono });
      if (check.status !== RtuResultStatus.SUCCESS) {
        throw new RtuSyncError(`RTU add not confirmed: ${check.status}`, {
          reply: check.rawReply,
        });
      }
    }

    inv = await transition(ctx, inv, InvitationStatus.ACTIVE, {
      dispositivo_id: device.id,
      rtu_slot: slot,
      last_error: null,
    });
    await auditEvent(ctx, {
      tipo: EventType.RTU_SYNC_SUCCESS,
      entidad: EntityType.INVITATION,
      entidad_id: inv.id,
      payload: { operation: RtuOperation.ADD_USER, command: result.command },
    });
    await auditEvent(ctx, {
      tipo: EventType.INVITATION_ACTIVATED,
      entidad: EntityType.INVITATION,
      entidad_id: inv.id,
      payload: { slot },
    });
    return inv;
  } catch (error) {
    return failSync(ctx, inv, RtuOperation.ADD_USER, error);
  }
}

/**
 * Remove an invitation from the RTU. Reason-agnostic: callers (expire/cancel)
 * own the domain milestone event; this handles the device interaction and the
 * REMOVING -> REMOVED transition. If the invitation was never loaded (no slot)
 * it is closed out without touching the device.
 */
export async function syncRemoveAccess(
  ctx: SkillContext,
  invitationId: string,
): Promise<Invitation> {
  let inv = await ctx.store.invitations.get(invitationId);
  if (!inv) throw new NotFoundError("Invitation", invitationId);
  if (inv.estado === InvitationStatus.REMOVED) return inv;

  // Never loaded on the device — close out without an SMS round-trip.
  if (inv.rtu_slot === null) {
    return closeOut(ctx, inv);
  }

  const device = await resolveDevice(ctx, inv);
  const slot = inv.rtu_slot;
  inv = await transition(ctx, inv, InvitationStatus.REMOVING);

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { operation: RtuOperation.REMOVE_USER, slot, deviceId: device.id },
  });

  try {
    const result = await withRetry(
      async () => {
        const r = await rtuRemoveUser(ctx, { device, slot });
        if (r.status !== RtuResultStatus.SUCCESS) {
          throw new RtuSyncError(`RTU remove failed: ${r.status}`, { reply: r.rawReply });
        }
        return r;
      },
      ctx.syncRetry,
    );

    inv = await transition(ctx, inv, InvitationStatus.REMOVED, {
      dispositivo_id: null,
      rtu_slot: null,
      last_error: null,
    });
    await auditEvent(ctx, {
      tipo: EventType.RTU_SYNC_SUCCESS,
      entidad: EntityType.INVITATION,
      entidad_id: inv.id,
      payload: { operation: RtuOperation.REMOVE_USER, command: result.command },
    });
    return inv;
  } catch (error) {
    return failSync(ctx, inv, RtuOperation.REMOVE_USER, error);
  }
}

/** Mark a never-synced invitation REMOVED, going through REMOVING when needed. */
async function closeOut(ctx: SkillContext, inv: Invitation): Promise<Invitation> {
  if (canTransition(inv.estado, InvitationStatus.REMOVED)) {
    return transition(ctx, inv, InvitationStatus.REMOVED);
  }
  const removing = await transition(ctx, inv, InvitationStatus.REMOVING);
  return transition(ctx, removing, InvitationStatus.REMOVED);
}

/**
 * Record a failed sync: ERROR status, attempt counter, audit event, and — while
 * under the lifetime cap — schedule a RETRY job so the lifecycle re-drives it
 * automatically. Past the cap the invitation is left in ERROR for manual review.
 */
async function failSync(
  ctx: SkillContext,
  inv: Invitation,
  operation: RtuOperation,
  error: unknown,
): Promise<Invitation> {
  const message = error instanceof Error ? error.message : String(error);
  // ERROR is reached only from PENDING_SYNC (add) or REMOVING (remove); route
  // through transition() so the state-machine invariant is validated.
  const updated = await transition(ctx, inv, InvitationStatus.ERROR, {
    sync_attempts: inv.sync_attempts + 1,
    last_error: message,
  });

  const exhausted = updated.sync_attempts >= RTU_SYNC_RETRY.MAX_LIFETIME_ATTEMPTS;
  if (!exhausted) {
    const delay =
      RTU_SYNC_RETRY.RETRY_JOB_BASE_DELAY_MS * 2 ** (updated.sync_attempts - 1);
    await ctx.scheduler.schedule(
      "RETRY",
      updated.id,
      new Date(ctx.now().getTime() + delay),
    );
  }

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_FAILED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: {
      operation,
      error: message,
      attempts: updated.sync_attempts,
      willRetry: !exhausted,
    },
  });
  return updated;
}
