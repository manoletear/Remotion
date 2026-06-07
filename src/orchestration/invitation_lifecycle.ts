import { InvitationStatus } from "../shared/enums.js";
import { activateInvitation } from "../skills/activate_invitation.js";
import type { SkillContext } from "../skills/context.js";
import { expireInvitation } from "../skills/expire_invitation.js";
import { syncAddAccess, syncRemoveAccess } from "./rtu_sync.js";

export interface TickReport {
  processed: number;
  activated: number;
  expired: number;
  retried: number;
}

/**
 * Invitation lifecycle driver.
 *
 * Pulls every due job from the Scheduler MCP and dispatches it to the right
 * skill: ACTIVATION -> activate, EXPIRATION -> expire, RETRY -> re-drive based
 * on current status. Designed to be invoked by a cron tick (e.g. every minute)
 * or, in tests, with an explicit `now`. Completing the job is the scheduler's
 * cursor — failures leave the invitation in ERROR for a later RETRY.
 */
export async function tick(ctx: SkillContext, now: Date = ctx.now()): Promise<TickReport> {
  const due = await ctx.scheduler.due(now);
  const report: TickReport = { processed: 0, activated: 0, expired: 0, retried: 0 };

  for (const job of due) {
    report.processed++;
    // Isolate each job: one failing invitation must not block the rest of the
    // batch. RTU failures already land in ERROR with an audit trail and a
    // scheduled RETRY; here we guard against unexpected throws (e.g. NotFound).
    try {
      switch (job.kind) {
        case "ACTIVATION": {
          await activateInvitation(ctx, job.invitationId);
          report.activated++;
          break;
        }
        case "EXPIRATION": {
          await expireInvitation(ctx, job.invitationId);
          report.expired++;
          break;
        }
        case "RETRY": {
          await retry(ctx, job.invitationId);
          report.retried++;
          break;
        }
        default: {
          // eslint-disable-next-line no-console
          console.warn(`Unknown job kind: ${job.kind} (${job.invitationId})`);
          break;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Lifecycle job ${job.id} (${job.invitationId}) failed:`, error);
    } finally {
      await ctx.scheduler.complete(job.id);
    }
  }

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

export { syncAddAccess, syncRemoveAccess } from "./rtu_sync.js";
