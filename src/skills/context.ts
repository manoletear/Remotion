import type { DataStore } from "../mcp/supabase/port.js";
import type { SmsGatewayPort } from "../mcp/sms_gateway/port.js";
import type { SchedulerPort } from "../mcp/scheduler/port.js";
import type { NotificationPort } from "../mcp/notifications/port.js";

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
}

/** Build a context, defaulting the clock. */
export function makeContext(
  deps: Omit<SkillContext, "now"> & Partial<Pick<SkillContext, "now">>,
): SkillContext {
  return {
    now: () => new Date(),
    ...deps,
  };
}
