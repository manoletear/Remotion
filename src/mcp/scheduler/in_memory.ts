import { newId } from "../../shared/utils.js";
import type { ScheduledJob, ScheduledKind, SchedulerPort } from "./port.js";

/**
 * In-memory scheduler. Jobs are held in a list and surfaced via `due()`, which
 * an external driver (cron loop, or the demo) polls. Deterministic and easy to
 * test — no real timers, so tests can advance "now" explicitly.
 */
export class InMemoryScheduler implements SchedulerPort {
  private readonly jobs = new Map<string, ScheduledJob>();

  async schedule(kind: ScheduledKind, invitationId: string, runAt: Date): Promise<ScheduledJob> {
    // Replace any existing job of the same kind for this invitation.
    for (const [id, job] of this.jobs) {
      if (job.invitationId === invitationId && job.kind === kind) this.jobs.delete(id);
    }
    const job: ScheduledJob = {
      id: newId(),
      kind,
      invitationId,
      runAt: runAt.toISOString(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async cancel(invitationId: string, kind?: ScheduledKind): Promise<void> {
    for (const [id, job] of this.jobs) {
      if (job.invitationId === invitationId && (!kind || job.kind === kind)) {
        this.jobs.delete(id);
      }
    }
  }

  async due(now: Date = new Date()): Promise<ScheduledJob[]> {
    return [...this.jobs.values()]
      .filter((j) => new Date(j.runAt) <= now)
      .sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  async complete(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }
}
