import type { Device } from "../domain/device/index.js";
import type { Resident } from "../domain/resident/index.js";
import { assertResidentTransition } from "../domain/resident/index.js";
import { RTU5024, RTU_ACK_TIMEOUT_MS, RTU_SYNC_RETRY } from "../shared/constants.js";
import {
  EntityType,
  EventType,
  ResidentStatus,
  RtuOperation,
  RtuResultStatus,
} from "../shared/enums.js";
import type { ResidentPatch } from "../mcp/supabase/port.js";
import { NotFoundError, RtuSyncError } from "../shared/errors.js";
import { auditEvent } from "../skills/audit_event.js";
import type { SkillContext } from "../skills/context.js";
import { parseMutationReply } from "../skills/rtu/protocol.js";
import { rtuAddUser } from "../skills/rtu_add_user.js";
import { rtuRemoveUser } from "../skills/rtu_remove_user.js";

/**
 * Permanent-access RTU sync engine — the FAMILIAR/EMPLEADO counterpart of
 * `orchestration/rtu_sync.ts`'s invitation engine. Deliberately a parallel,
 * standalone module rather than a generalization of `rtu_sync.ts`; see
 * specs/003-household-permanent-access/research.md for why. Every structural
 * choice here (dispatch/confirm decoupling, slot reservation before send,
 * ack-timeout, retry-with-backoff) mirrors that module on purpose.
 */

/** Persist a validated status transition and return the new row. */
async function transition(
  ctx: SkillContext,
  resident: Resident,
  to: ResidentStatus,
  patch: ResidentPatch = {},
): Promise<Resident> {
  assertResidentTransition(resident.estado, to);
  return ctx.store.residents.update(resident.id, { ...patch, estado: to });
}

/** Lowest free permanent (1-99) slot on a device, or throw when full (FR-009). */
async function assignSlot(ctx: SkillContext, device: Device): Promise<number> {
  const occupied = new Set(await ctx.store.residents.occupiedSlots(device.id));
  for (let slot = RTU5024.RESIDENT_SLOT_START; slot < RTU5024.INVITATION_SLOT_START; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  throw new RtuSyncError("No free permanent RTU slot available", { deviceId: device.id });
}

async function resolveDevice(ctx: SkillContext, resident: Resident): Promise<Device> {
  const device = await ctx.store.devices.getForProperty(resident.propiedad_id);
  if (!device) {
    throw new RtuSyncError("No device serves this property", {
      propiedad_id: resident.propiedad_id,
    });
  }
  return device;
}

function timedOut(resident: Resident, now: Date): boolean {
  if (!resident.sent_at) return false;
  return now.getTime() - Date.parse(resident.sent_at) > RTU_ACK_TIMEOUT_MS;
}

/**
 * Dispatch a permanent authorization onto the RTU. Reserves a stable
 * phonebook slot (1-99), marks the resident PENDING_SYNC with a `sent_at`, and
 * sends the command without waiting for the device's reply — confirmation is
 * reconciled separately ({@link confirmOnePermanent}).
 */
export async function syncAddPermanent(
  ctx: SkillContext,
  residentId: string,
): Promise<Resident> {
  let resident = await ctx.store.residents.get(residentId);
  if (!resident) throw new NotFoundError("Resident", residentId);

  const actionable = [ResidentStatus.PENDING_SYNC, ResidentStatus.ERROR];
  if (!actionable.includes(resident.estado)) return resident;

  const device = await resolveDevice(ctx, resident);
  const slot = resident.rtu_slot ?? (await assignSlot(ctx, device));
  const reserve: ResidentPatch = {
    dispositivo_id: device.id,
    rtu_slot: slot,
    sent_at: ctx.now().toISOString(),
    last_error: null,
  };
  resident =
    resident.estado === ResidentStatus.PENDING_SYNC
      ? await ctx.store.residents.update(resident.id, reserve)
      : await transition(ctx, resident, ResidentStatus.PENDING_SYNC, reserve);

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { operation: RtuOperation.ADD_USER, slot, deviceId: device.id },
  });

  try {
    const dispatch = await rtuAddUser(ctx, { device, phone: resident.telefono, slot });
    if (dispatch.sendStatus === "failed") {
      throw new RtuSyncError("RTU add failed: send rejected by gateway");
    }
  } catch (error) {
    return failSync(ctx, resident, RtuOperation.ADD_USER, error);
  }

  return confirmOnePermanent(ctx, resident, ctx.now());
}

/**
 * Dispatch a permanent-access removal. If the resident was never loaded on
 * the device (no slot), closes out without an SMS round-trip.
 */
export async function syncRemovePermanent(
  ctx: SkillContext,
  residentId: string,
): Promise<Resident> {
  let resident = await ctx.store.residents.get(residentId);
  if (!resident) throw new NotFoundError("Resident", residentId);
  if (resident.estado === ResidentStatus.REMOVED) return resident;

  if (resident.rtu_slot === null) {
    return closeOut(ctx, resident);
  }

  const device = await resolveDevice(ctx, resident);
  const slot = resident.rtu_slot;
  const reserve: ResidentPatch = {
    sent_at: ctx.now().toISOString(),
    removal_requested: true,
  };
  resident =
    resident.estado === ResidentStatus.REMOVING
      ? await ctx.store.residents.update(resident.id, reserve)
      : await transition(ctx, resident, ResidentStatus.REMOVING, reserve);

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_STARTED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { operation: RtuOperation.REMOVE_USER, slot, deviceId: device.id },
  });

  try {
    const dispatch = await rtuRemoveUser(ctx, { device, slot });
    if (dispatch.sendStatus === "failed") {
      throw new RtuSyncError("RTU remove failed: send rejected by gateway");
    }
  } catch (error) {
    return failSync(ctx, resident, RtuOperation.REMOVE_USER, error);
  }

  return confirmOnePermanent(ctx, resident, ctx.now());
}

/**
 * Reconcile a single in-flight resident against the device's reply.
 * Non-blocking, mirrors `rtu_sync.ts`'s `confirmOne` exactly.
 */
export async function confirmOnePermanent(
  ctx: SkillContext,
  resident: Resident,
  now: Date = ctx.now(),
): Promise<Resident> {
  if (
    resident.estado !== ResidentStatus.PENDING_SYNC &&
    resident.estado !== ResidentStatus.REMOVING
  ) {
    return resident;
  }

  const device = await resolveDevice(ctx, resident);
  const since = resident.sent_at ?? resident.created_at;
  const reply = await ctx.sms.pollReply(device.numero_sim, since);

  if (resident.estado === ResidentStatus.PENDING_SYNC) {
    if (reply) {
      if (parseMutationReply(reply.body) === RtuResultStatus.SUCCESS) {
        const active = await transition(ctx, resident, ResidentStatus.ACTIVE, {
          sent_at: null,
          last_error: null,
        });
        await auditEvent(ctx, {
          tipo: EventType.RTU_SYNC_SUCCESS,
          entidad: EntityType.RESIDENT,
          entidad_id: active.id,
          payload: { operation: RtuOperation.ADD_USER },
        });
        return active;
      }
      return failSync(
        ctx,
        resident,
        RtuOperation.ADD_USER,
        new RtuSyncError(`RTU add failed: ${reply.body}`),
      );
    }
    if (timedOut(resident, now)) {
      return failSync(
        ctx,
        resident,
        RtuOperation.ADD_USER,
        new RtuSyncError("RTU add not confirmed: device ack timeout"),
      );
    }
    return resident; // still in-flight
  }

  // REMOVING
  if (reply) {
    if (parseMutationReply(reply.body) === RtuResultStatus.SUCCESS) {
      const removed = await transition(ctx, resident, ResidentStatus.REMOVED, {
        dispositivo_id: null,
        rtu_slot: null,
        sent_at: null,
        last_error: null,
      });
      await auditEvent(ctx, {
        tipo: EventType.RTU_SYNC_SUCCESS,
        entidad: EntityType.RESIDENT,
        entidad_id: removed.id,
        payload: { operation: RtuOperation.REMOVE_USER },
      });
      return removed;
    }
    return failSync(
      ctx,
      resident,
      RtuOperation.REMOVE_USER,
      new RtuSyncError(`RTU remove failed: ${reply.body}`),
    );
  }
  if (timedOut(resident, now)) {
    return failSync(
      ctx,
      resident,
      RtuOperation.REMOVE_USER,
      new RtuSyncError("RTU remove not confirmed: device ack timeout"),
    );
  }
  return resident; // still in-flight
}

/** Reconcile every in-flight (PENDING_SYNC/REMOVING) resident. Called by `tick()`. */
export async function confirmInFlightPermanent(
  ctx: SkillContext,
  now: Date = ctx.now(),
): Promise<void> {
  const inFlight = [
    ...(await ctx.store.residents.listByStatus(ResidentStatus.PENDING_SYNC)),
    ...(await ctx.store.residents.listByStatus(ResidentStatus.REMOVING)),
  ];
  for (const resident of inFlight) {
    try {
      await confirmOnePermanent(ctx, resident, now);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Confirm failed for resident ${resident.id}:`, error);
    }
  }
}

/** Mark a never-synced resident REMOVED, going through REMOVING when needed. */
async function closeOut(ctx: SkillContext, resident: Resident): Promise<Resident> {
  if (resident.estado === ResidentStatus.PENDING_SYNC) {
    const removing = await transition(ctx, resident, ResidentStatus.REMOVING, {
      removal_requested: true,
    });
    return transition(ctx, removing, ResidentStatus.REMOVED);
  }
  return transition(ctx, resident, ResidentStatus.REMOVED, { removal_requested: true });
}

/**
 * Record a failed sync: ERROR status, attempt counter, audit event, and —
 * while under the lifetime cap — schedule a RETRY job. Mirrors
 * `rtu_sync.ts`'s `failSync` exactly, targeting `entityType: "RESIDENT"`.
 */
async function failSync(
  ctx: SkillContext,
  resident: Resident,
  operation: RtuOperation,
  error: unknown,
): Promise<Resident> {
  const message = error instanceof Error ? error.message : String(error);
  const updated = await transition(ctx, resident, ResidentStatus.ERROR, {
    sync_attempts: resident.sync_attempts + 1,
    last_error: message,
    sent_at: null,
  });

  const exhausted = updated.sync_attempts >= RTU_SYNC_RETRY.MAX_LIFETIME_ATTEMPTS;
  if (!exhausted) {
    const delay =
      RTU_SYNC_RETRY.RETRY_JOB_BASE_DELAY_MS * 2 ** (updated.sync_attempts - 1);
    await ctx.scheduler.schedule(
      "RETRY",
      "RESIDENT",
      updated.id,
      new Date(ctx.now().getTime() + delay),
    );
  }

  await auditEvent(ctx, {
    tipo: EventType.RTU_SYNC_FAILED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: {
      operation,
      error: message,
      attempts: updated.sync_attempts,
      willRetry: !exhausted,
    },
  });
  return updated;
}
