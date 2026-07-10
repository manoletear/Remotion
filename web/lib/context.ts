import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConsoleNotifier,
  SupabaseDataStore,
  SupabaseScheduler,
  TwilioSmsGateway,
  makeContext,
  pollInboundSms,
  type SkillContext,
} from "gsm-gate-access-layer";

import { createServiceClient } from "./supabase";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Twilio adapter shared by every context flavor below. `pollInbound` always
 * reads through a service-role client — `inbound_sms` carries no per-resident
 * data and has no RLS read policy for authenticated users.
 */
function makeTwilioGateway(serviceClient: SupabaseClient): TwilioSmsGateway {
  return new TwilioSmsGateway({
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
    from: env("TWILIO_FROM"),
    pollInbound: (from, sinceIso) => pollInboundSms(serviceClient, from, sinceIso),
  });
}

/**
 * Build a SkillContext for a resident server action or component.
 *
 * - store: session client → RLS enforced (resident sees only their rows).
 * - scheduler: service role → writes jobs (no RLS write policy for authenticated users).
 * - sms: Twilio outbound for RTU commands; inbound replies polled via service role.
 */
export function makeServerContext(sessionClient: SupabaseClient): SkillContext {
  const serviceClient = createServiceClient();
  return makeContext({
    store: new SupabaseDataStore(sessionClient),
    sms: makeTwilioGateway(serviceClient),
    scheduler: new SupabaseScheduler(serviceClient),
    notifier: new ConsoleNotifier(),
  });
}

/**
 * Build a SkillContext for system operations with no acting resident: the
 * scheduled `/api/tick` cron and the `/api/sms/inbound` webhook. Everything
 * runs under the service-role client — there is no session to scope RLS to,
 * and `tick` must be able to advance any property's due jobs.
 */
export function makeSystemContext(): SkillContext {
  const serviceClient = createServiceClient();
  return makeContext({
    store: new SupabaseDataStore(serviceClient),
    sms: makeTwilioGateway(serviceClient),
    scheduler: new SupabaseScheduler(serviceClient),
    notifier: new ConsoleNotifier(),
  });
}
