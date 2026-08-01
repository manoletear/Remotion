import { InvitationStatus, ResidentStatus } from "../shared/enums.js";
import { activateInvitation } from "../skills/activate_invitation.js";
import type { SkillContext } from "../skills/context.js";
import { expireInvitation } from "../skills/expire_invitation.js";
import { confirmInFlight, syncAddAccess, syncRemoveAccess } from "./rtu_sync.js";
import {
  confirmInFlightPermanent,
  syncAddPermanent,
  syncRemovePermanent,
} from "./permanent_access_sync.js";

export interface TickReport {
  processed: number;
  activated: number;
  expired: number;
  retried: number;
}

/**
 * Invitation + permanent-access lifecycle driver.
 *
 * Pulls every due job from the Scheduler MCP and dispatches it to the right
 * skill: ACTIVATION -> activate, EXPIRATION -> expire, RETRY -> re-drive based
 * on current status and `job.entityType` (INVITATION or RESIDENT — see
 * specs/003-household-permanent-access). Designed to be invoked by a cron
 * tick (e.g. every minute) or, in tests, with an explicit `now`. Completing
 * the job is the scheduler's cursor — failures leave the entity in ERROR for
 * a later RETRY.
 */
export async function tick(ctx: SkillContext, now: Date = ctx.now()): Promise<TickReport> {
  const due = await ctx.scheduler.due(now);
  const report: TickReport = { processed: 0, activated: 0, expired: 0, retried: 0 };

  for (const job of due) {
    report.processed++;
    // Isolate each job: one failing entity must not block the rest of the
    // batch. RTU failures already land in ERROR with an audit trail and a
    // scheduled RETRY; here we guard against unexpected throws (e.g. NotFound).
    try {
      switch (job.kind) {
        case "ACTIVATION": {
          await activateInvitation(ctx, job.entityId);
          report.activated++;
          break;
        }
        case "EXPIRATION": {
          await expireInvitation(ctx, job.entityId);
          report.expired++;
          break;
        }
        case "RETRY": {
          if (job.entityType === "RESIDENT") {
            await retryPermanent(ctx, job.entityId);
          } else {
            await retry(ctx, job.entityId);
          }
          report.retried++;
          break;
        }
        default: {
          // eslint-disable-next-line no-console
          console.warn(`Unknown job kind: ${job.kind} (${job.entityId})`);
          break;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Lifecycle job ${job.id} (${job.entityId}) failed:`, error);
    } finally {
      await ctx.scheduler.complete(job.id);
    }
  }

  // Reconcile any in-flight commands whose device reply has arrived out-of-band
  // (real RTU via the inbound webhook). Non-blocking: replies not yet in are
  // simply picked up next tick. For the fake gateway this is a no-op because the
  // opportunistic confirm at dispatch already finalized them.
  await confirmInFlight(ctx, now);
  await confirmInFlightPermanent(ctx, now);

  return report;
}

/**
 * Re-drive an ERROR invitation toward its intended end state. Cancellation or a
 * past window means the access must be absent (re-drive removal); otherwise it
 * must be present (re-drive the add). Re-drives the sync engine directly so the
 * domain milestone events (cancelled/expired) are not emitted twice.
 */
async function retry(ctx: SkillContext, invitationId: string): Promise<void> {
  const inv = await ctx.store.invitations.get(invitationId);
  if (!inv || inv.estado !== InvitationStatus.ERROR) return;

  const mustBeRemoved = inv.cancelled || new Date(inv.fecha_fin) <= ctx.now();
  if (mustBeRemoved) {
    await syncRemoveAccess(ctx, invitationId);
  } else {
    await syncAddAccess(ctx, invitationId);
  }
}

/**
 * Re-drive an ERROR permanent access-holder toward its intended end state —
 * the resident equivalent of {@link retry}, using `removal_requested` in
 * place of invitation's `cancelled` (permanent access has no time window, so
 * there is no expiration-based "must be removed" case here).
 */
async function retryPermanent(ctx: SkillContext, residentId: string): Promise<void> {
  const resident = await ctx.store.residents.get(residentId);
  if (!resident || resident.estado !== ResidentStatus.ERROR) return;

  if (resident.removal_requested) {
    await syncRemovePermanent(ctx, residentId);
  } else {
    await syncAddPermanent(ctx, residentId);
  }
}

export { confirmInFlight, syncAddAccess, syncRemoveAccess } from "./rtu_sync.js";
export {
  confirmInFlightPermanent,
  syncAddPermanent,
  syncRemovePermanent,
} from "./permanent_access_sync.js";
