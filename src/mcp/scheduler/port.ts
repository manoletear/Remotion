/**
 * Scheduler port.
 *
 * Drives time-based steps of the invitation lifecycle (activation, expiration)
 * and retries of failed RTU syncs for either an invitation or a permanent
 * access-holder (resident) — see specs/003-household-permanent-access. A
 * concrete adapter could wrap a cron service, a queue with delays, or Supabase
 * scheduled functions.
 */

export type ScheduledKind = "ACTIVATION" | "EXPIRATION" | "RETRY";
export type ScheduledEntityType = "INVITATION" | "RESIDENT";

export interface ScheduledJob {
  id: string;
  kind: ScheduledKind;
  entityType: ScheduledEntityType;
  entityId: string;
  /** When the job should fire (ISO-8601). */
  runAt: string;
}

export interface SchedulerPort {
  /** Schedule (or reschedule) a job; returns the job handle. */
  schedule(
    kind: ScheduledKind,
    entityType: ScheduledEntityType,
    entityId: string,
    runAt: Date,
  ): Promise<ScheduledJob>;
  /** Cancel any pending jobs for an entity (all kinds, or one kind). */
  cancel(entityId: string, kind?: ScheduledKind): Promise<void>;
  /** Jobs whose runAt is at or before `now` and still pending. */
  due(now?: Date): Promise<ScheduledJob[]>;
  /** Mark a job consumed so it is not returned by `due` again. */
  complete(jobId: string): Promise<void>;
}
