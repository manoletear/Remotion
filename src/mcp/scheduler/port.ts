/**
 * Scheduler port.
 *
 * Drives time-based steps of the invitation lifecycle: activation at the start
 * of the window, expiration at the end, and retries of failed RTU syncs. A
 * concrete adapter could wrap a cron service, a queue with delays, or Supabase
 * scheduled functions. The callback receives the invitation id.
 */

export type ScheduledKind = "ACTIVATION" | "EXPIRATION" | "RETRY";

export interface ScheduledJob {
  id: string;
  kind: ScheduledKind;
  invitationId: string;
  /** When the job should fire (ISO-8601). */
  runAt: string;
}

export interface SchedulerPort {
  /** Schedule (or reschedule) a job; returns the job handle. */
  schedule(kind: ScheduledKind, invitationId: string, runAt: Date): Promise<ScheduledJob>;
  /** Cancel any pending jobs for an invitation (all kinds, or one kind). */
  cancel(invitationId: string, kind?: ScheduledKind): Promise<void>;
  /** Jobs whose runAt is at or before `now` and still pending. */
  due(now?: Date): Promise<ScheduledJob[]>;
  /** Mark a job consumed so it is not returned by `due` again. */
  complete(jobId: string): Promise<void>;
}
