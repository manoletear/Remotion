import type { DataStore } from "../mcp/supabase/port.js";
import type { SmsGatewayPort } from "../mcp/sms_gateway/port.js";
import type { SchedulerPort } from "../mcp/scheduler/port.js";
import type { NotificationPort } from "../mcp/notifications/port.js";
import { RTU_SYNC_RETRY } from "../shared/constants.js";

/** Retry policy for RTU synchronization, injectable for fast tests. */
export interface SyncRetryPolicy {
  maxAttempts: number;
  baseMs: number;
}

/**
 * Dependency bundle injected into every skill. Skills are plain functions that
 * receive a context plus typed input — no globals, no hidden singletons — which
 * makes them trivial to test with the in-memory/fake adapters.
 */
export interface SkillContext {
  store: DataStore;
  sms: SmsGatewayPort;
  scheduler: SchedulerPort;
  notifier: NotificationPort;
  /** Injectable clock for deterministic tests. Defaults to `() => new Date()`. */
  now: () => Date;
  /** RTU retry policy. Defaults to the production 2s/4s/8s/16s backoff. */
  syncRetry: SyncRetryPolicy;
  /**
   * When true, an add is confirmed by querying the device's authorized list
   * (RTU Query User) before marking the invitation ACTIVE. Costs an extra SMS
   * but turns the heuristic add-reply into a verified state. Defaults to false.
   */
  verifyAfterSync: boolean;
}

/** Build a context, defaulting the clock and retry policy. */
export function makeContext(
  deps: Omit<SkillContext, "now" | "syncRetry" | "verifyAfterSync"> &
    Partial<Pick<SkillContext, "now" | "syncRetry" | "verifyAfterSync">>,
): SkillContext {
  return {
    now: () => new Date(),
    syncRetry: {
      maxAttempts: RTU_SYNC_RETRY.MAX_ATTEMPTS,
      baseMs: RTU_SYNC_RETRY.BASE_BACKOFF_MS,
    },
    verifyAfterSync: false,
    ...deps,
  };
}
