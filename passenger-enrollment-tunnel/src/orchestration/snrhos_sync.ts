import type { Ficha } from "../domain/ficha/index.js";
import { assertTransition } from "../domain/ficha/index.js";
import type { FichaPatch } from "../mcp/store/port.js";
import type { SnrhosResult } from "../mcp/snrhos/port.js";
import {
  EventType,
  FichaStatus,
  SnrhosResultStatus,
} from "../shared/enums.js";
import { NotFoundError, SnrhosSyncError } from "../shared/errors.js";
import { auditEvent } from "../skills/audit_event.js";
import type { TunnelContext } from "../skills/context.js";

/** Persist a validated status transition and return the new row. */
async function transition(
  ctx: TunnelContext,
  ficha: Ficha,
  to: FichaStatus,
  patch: FichaPatch = {},
): Promise<Ficha> {
  assertTransition(ficha.estado, to);
  return ctx.store.fichas.update(ficha.id, { ...patch, estado: to });
}

/** Map an SNRHos result to an outcome the state machine understands. */
function classify(result: SnrhosResult): "ok" | "retryable" | "rejected" {
  switch (result.status) {
    case SnrhosResultStatus.SUCCESS:
      return "ok";
    case SnrhosResultStatus.SERVER_ERROR:
    case SnrhosResultStatus.TIMEOUT:
      return "retryable"; // -> contingency queue
    case SnrhosResultStatus.REJECTED:
      return "rejected"; // -> ERROR, needs correction
  }
}

/**
 * Register a ficha's check-in with SNRHos (CAPTURA -> FICHA -> SNRHos).
 *
 * The contingency contract from the Portaria: a transient SNRHos failure
 * (5xx/timeout) must NOT block the guest. So on a retryable error the ficha is
 * parked in CONTINGENCY (the local encrypted queue) and the desk proceeds; a
 * 4xx rejection instead lands in ERROR for correction. Idempotent: only acts on
 * CAPTURED/PENDING_SYNC/CONTINGENCY/ERROR fichas.
 */
export async function registerCheckin(
  ctx: TunnelContext,
  fichaId: string,
): Promise<Ficha> {
  let ficha = await ctx.store.fichas.get(fichaId);
  if (!ficha) throw new NotFoundError("Ficha", fichaId);

  const actionable = [
    FichaStatus.CAPTURED,
    FichaStatus.PENDING_SYNC,
    FichaStatus.CONTINGENCY,
    FichaStatus.ERROR,
  ];
  if (!actionable.includes(ficha.estado)) return ficha; // nothing to do
  const hospede = ficha.hospede;
  if (!hospede) {
    throw new SnrhosSyncError("Ficha sin datos de huésped", false, { fichaId });
  }

  if (ficha.estado !== FichaStatus.PENDING_SYNC) {
    ficha = await transition(ctx, ficha, FichaStatus.PENDING_SYNC);
  }

  const checkinAt = ctx.now().toISOString();
  await auditEvent(ctx, {
    tipo: EventType.SNRHOS_SYNC_STARTED,
    fichaId: ficha.id,
    payload: { reservaLocalizador: ficha.reservaLocalizador },
  });

  const result = await ctx.snrhos.registerCheckin({
    reservaLocalizador: ficha.reservaLocalizador,
    hospede,
    checkinAt,
  });

  switch (classify(result)) {
    case "ok": {
      ficha = await transition(ctx, ficha, FichaStatus.REGISTERED, {
        protocoloSnrhos: result.protocolo ?? null,
        checkinAt,
        lastError: null,
      });
      await auditEvent(ctx, {
        tipo: EventType.SNRHOS_SYNC_SUCCESS,
        fichaId: ficha.id,
        payload: { protocolo: result.protocolo },
      });
      return ficha;
    }
    case "retryable": {
      // Contingency: store locally (encrypted, in the real adapter) and let the
      // guest through. The drain job will push it when SNRHos recovers.
      ficha = await transition(ctx, ficha, FichaStatus.CONTINGENCY, {
        syncAttempts: ficha.syncAttempts + 1,
        lastError: `SNRHos no disponible (${result.status})`,
      });
      await auditEvent(ctx, {
        tipo: EventType.CONTINGENCY_ENQUEUED,
        fichaId: ficha.id,
        payload: { status: result.status, httpStatus: result.httpStatus },
      });
      return ficha;
    }
    case "rejected": {
      ficha = await transition(ctx, ficha, FichaStatus.ERROR, {
        syncAttempts: ficha.syncAttempts + 1,
        lastError: `SNRHos rechazó el payload (${result.httpStatus ?? "4xx"})`,
      });
      await auditEvent(ctx, {
        tipo: EventType.SNRHOS_SYNC_REJECTED,
        fichaId: ficha.id,
        payload: { httpStatus: result.httpStatus, body: result.rawBody },
      });
      return ficha;
    }
  }
}

/**
 * Drain the contingency queue: re-attempt every ficha parked in CONTINGENCY.
 *
 * Called by the scheduler when the SNRHos node is reachable again. Fichas that
 * still fail stay in (or return to) the queue via `registerCheckin`; successful
 * ones become REGISTERED, regularizing their legal state with no desk action.
 */
export async function drainContingency(
  ctx: TunnelContext,
): Promise<{ drained: number; pending: number }> {
  const queued = await ctx.store.fichas.listByStatus(FichaStatus.CONTINGENCY);
  let drained = 0;
  let pending = 0;

  for (const ficha of queued) {
    const after = await registerCheckin(ctx, ficha.id);
    if (after.estado === FichaStatus.REGISTERED) {
      drained++;
      await auditEvent(ctx, {
        tipo: EventType.CONTINGENCY_DRAINED,
        fichaId: ficha.id,
        payload: { protocolo: after.protocoloSnrhos },
      });
    } else {
      pending++;
    }
  }

  return { drained, pending };
}
