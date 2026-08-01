import type { Device } from "../domain/device/index.js";
import type { Invitation } from "../domain/invitation/index.js";
import {
  assertTransition,
  canTransition,
} from "../domain/invitation/index.js";
import { RTU5024, RTU_ACK_TIMEOUT_MS, RTU_SYNC_RETRY } from "../shared/constants.js";
import {
  EntityType,
  EventType,
  InvitationStatus,
  RtuOperation,
  RtuResultStatus,
} from "../shared/enums.js";
import type { InvitationPatch } from "../mcp/supabase/port.js";
import { NotFoundError, RtuSyncError } from "../shared/errors.js";
import { auditEvent } from "../skills/audit_event.js";
import type { SkillContext } from "../skills/context.js";
import { notifyVisitor } from "../skills/notify.js";
import { parseMutationReply } from "../skills/rtu/protocol.js";
import { rtuAddUser } from "../skills/rtu_add_user.js";
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

/** Whether an in-flight command has exceeded the device ack window. */
function timedOut(inv: Invitation, now: Date): boolean {
  if (!inv.sent_at) return false;
  return now.getTime() - Date.parse(inv.sent_at) > RTU_ACK_TIMEOUT_MS;
}

/**
 * Dispatch an add onto the RTU (PERMISO -> ACTIVACION -> DISPOSITIVO).
 *
 * Reserves a stable phonebook slot, marks the invitation PENDING_SYNC with a
 * `sent_at`, and **sends the command without waiting** for the device's reply.
 * Confirmation is reconciled separately ({@link confirmOne}); the opportunistic
 * confirm at the end finishes instantly against a fake device and defers to a
 * later tick against a real (async) one. Idempotent on non-actionable states.
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
  const slot = inv.rtu_slot ?? (await assignSlot(ctx, device));
  // Reserve the slot + device and mark in-flight before sending. The DB unique
  // index on (dispositivo_id, rtu_slot) makes the reservation race-safe.
  const reserve: InvitationPatch = {
    dispositivo_id: device.id,
    rtu_slot: slot,
    sent_at: ctx.now().toISOString(),
    last_error: null,
  };
  inv =
    inv.estado === InvitationStatus.PENDING_SYNC
      ? await ctx.store.invitations.update(inv.id, reserve)
      : await transition(ctx, inv, InvitationStatus.PENDING_SYNC, reserve);

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { operation: RtuOperation.ADD_USER, slot, deviceId: device.id },
  });

  try {
    const dispatch = await rtuAddUser(ctx, {
      device,
      phone: inv.visitante_telefono,
      slot,
    });
    if (dispatch.sendStatus === "failed") {
      throw new RtuSyncError("RTU add failed: send rejected by gateway");
    }
  } catch (error) {
    return failSync(ctx, inv, RtuOperation.ADD_USER, error);
  }

  return confirmOne(ctx, inv, ctx.now());
}

/**
 * Dispatch a removal from the RTU. Reason-agnostic: callers (expire/cancel) own
 * the domain milestone event; this sends the clear command and reconciles the
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
  const reserve: InvitationPatch = { sent_at: ctx.now().toISOString() };
  inv =
    inv.estado === InvitationStatus.REMOVING
      ? await ctx.store.invitations.update(inv.id, reserve)
      : await transition(ctx, inv, InvitationStatus.REMOVING, reserve);

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.INVITATION,
    entidad_id: inv.id,
    payload: { operation: RtuOperation.REMOVE_USER, slot, deviceId: device.id },
  });

  try {
    const dispatch = await rtuRemoveUser(ctx, { device, slot });
    if (dispatch.sendStatus === "failed") {
      throw new RtuSyncError("RTU remove failed: send rejected by gateway");
    }
  } catch (error) {
    return failSync(ctx, inv, RtuOperation.REMOVE_USER, error);
  }

  return confirmOne(ctx, inv, ctx.now());
}

/**
 * Reconcile a single in-flight invitation against the device's reply.
 *
 * Non-blocking: reads the reply that has arrived (if any) via the gateway's
 * `pollReply`. A present reply confirms ACTIVE/REMOVED (or fails); no reply
 * within the ack window times out into ERROR; otherwise the invitation is left
 * in-flight for a later tick. Only PENDING_SYNC / REMOVING are acted on.
 */
export async function confirmOne(
  ctx: SkillContext,
  inv: Invitation,
  now: Date = ctx.now(),
): Promise<Invitation> {
  if (
    inv.estado !== InvitationStatus.PENDING_SYNC &&
    inv.estado !== InvitationStatus.REMOVING
  ) {
    return inv;
  }

  const device = await resolveDevice(ctx, inv);
  const since = inv.sent_at ?? inv.updated_at;
  const reply = await ctx.sms.pollReply(device.numero_sim, since);

  if (inv.estado === InvitationStatus.PENDING_SYNC) {
    if (reply) {
      if (parseMutationReply(reply.body) === RtuResultStatus.SUCCESS) {
        const active = await transition(ctx, inv, InvitationStatus.ACTIVE, {
          sent_at: null,
          last_error: null,
        });
        await auditEvent(ctx, {
          tipo: EventType.RTU_SYNC_SUCCESS,
          entidad: EntityType.INVITATION,
          entidad_id: active.id,
          payload: { operation: RtuOperation.ADD_USER },
        });
        await auditEvent(ctx, {
          tipo: EventType.INVITATION_ACTIVATED,
          entidad: EntityType.INVITATION,
          entidad_id: active.id,
          payload: { slot: active.rtu_slot },
        });
        await notifyVisitor(
          ctx,
          active,
          "Acceso activado",
          "Tu acceso al portón ya está activo.",
        );
        return active;
      }
      return failSync(
        ctx,
        inv,
        RtuOperation.ADD_USER,
        new RtuSyncError(`RTU add failed: ${reply.body}`),
      );
    }
    if (timedOut(inv, now)) {
      return failSync(
        ctx,
        inv,
        RtuOperation.ADD_USER,
        new RtuSyncError("RTU add not confirmed: device ack timeout"),
      );
    }
    return inv; // still in-flight
  }

  // REMOVING
  if (reply) {
    if (parseMutationReply(reply.body) === RtuResultStatus.SUCCESS) {
      const removed = await transition(ctx, inv, InvitationStatus.REMOVED, {
        dispositivo_id: null,
        rtu_slot: null,
        sent_at: null,
        last_error: null,
      });
      await auditEvent(ctx, {
        tipo: EventType.RTU_SYNC_SUCCESS,
        entidad: EntityType.INVITATION,
        entidad_id: removed.id,
        payload: { operation: RtuOperation.REMOVE_USER },
      });
      return removed;
    }
    return failSync(
      ctx,
      inv,
      RtuOperation.REMOVE_USER,
      new RtuSyncError(`RTU remove failed: ${reply.body}`),
    );
  }
  if (timedOut(inv, now)) {
    return failSync(
      ctx,
      inv,
      RtuOperation.REMOVE_USER,
      new RtuSyncError("RTU remove not confirmed: device ack timeout"),
    );
  }
  return inv; // still in-flight
}

/**
 * Reconcile every in-flight invitation (PENDING_SYNC / REMOVING). Called by the
 * lifecycle tick so replies that arrived out-of-band (real RTU via the inbound
 * webhook) are confirmed without any blocking wait. One failure must not block
 * the rest of the sweep.
 */
export async function confirmInFlight(
  ctx: SkillContext,
  now: Date = ctx.now(),
): Promise<void> {
  const inFlight = [
    ...(await ctx.store.invitations.listByStatus(InvitationStatus.PENDING_SYNC)),
    ...(await ctx.store.invitations.listByStatus(InvitationStatus.REMOVING)),
  ];
  for (const inv of inFlight) {
    try {
      await confirmOne(ctx, inv, now);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Confirm failed for invitation ${inv.id}:`, error);
    }
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
 * The reserved slot is kept so the retry reuses the same phonebook position.
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
    sent_at: null,
  });

  const exhausted = updated.sync_attempts >= RTU_SYNC_RETRY.MAX_LIFETIME_ATTEMPTS;
  if (!exhausted) {
    const delay =
      RTU_SYNC_RETRY.RETRY_JOB_BASE_DELAY_MS * 2 ** (updated.sync_attempts - 1);
    await ctx.scheduler.schedule(
      "RETRY",
      "INVITATION",
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
