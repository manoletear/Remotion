import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConsoleNotifier,
  ResendNotifier,
  RoutingNotifier,
  SupabaseDataStore,
  SupabaseScheduler,
  TwilioNotifier,
  TwilioSmsGateway,
  makeContext,
  pollInboundSms,
  type NotificationPort,
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
 * Real notifier: SMS/EMAIL for owner invitations (005), WhatsApp/push still
 * fall back to a console log — no real adapter exists for those channels
 * anywhere in this system (see research.md). `RESEND_API_KEY` is optional;
 * unset, email degrades to a log instead of throwing.
 */
function makeNotifier(): NotificationPort {
  return new RoutingNotifier(
    new TwilioNotifier({
      accountSid: env("TWILIO_ACCOUNT_SID"),
      authToken: env("TWILIO_AUTH_TOKEN"),
      from: env("TWILIO_FROM"),
    }),
    new ResendNotifier({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM ?? "CondoGATE <onboarding@resend.dev>",
    }),
    new ConsoleNotifier(),
  );
}

/**
 * Build a SkillContext for a resident server action or component.
 *
 * - store: session client → RLS enforced (resident sees only their rows) —
 *   EXCEPT `events`, which is sourced from the service-role store instead:
 *   `eventos` has RLS enabled with intentionally no write policy for
 *   authenticated users (migration 0004's design — audit writes are meant to
 *   come from service-role skills/workers only), so skills like
 *   `createInvitation` that call `auditEvent` mid-flow would otherwise throw
 *   on the audit insert *after* already having written the primary row.
 * - scheduler: service role → writes jobs (no RLS write policy for authenticated users).
 * - sms: Twilio outbound for RTU commands; inbound replies polled via service role.
 */
export function makeServerContext(sessionClient: SupabaseClient): SkillContext {
  const serviceClient = createServiceClient();
  const sessionStore = new SupabaseDataStore(sessionClient);
  const serviceStore = new SupabaseDataStore(serviceClient);
  return makeContext({
    store: { ...sessionStore, events: serviceStore.events },
    sms: makeTwilioGateway(serviceClient),
    scheduler: new SupabaseScheduler(serviceClient),
    notifier: makeNotifier(),
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
    notifier: makeNotifier(),
  });
}
