import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConsoleNotifier,
  SupabaseDataStore,
  SupabaseScheduler,
  TwilioSmsGateway,
  makeContext,
  type SkillContext,
} from "gsm-gate-access-layer";

import { createServiceClient } from "./supabase";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Build a SkillContext for a resident server action or component.
 *
 * - store: session client → RLS enforced (resident sees only their rows).
 * - scheduler: service role → writes jobs (no RLS write policy for authenticated users).
 * - sms: Twilio outbound for RTU commands.
 */
export function makeServerContext(sessionClient: SupabaseClient): SkillContext {
  return makeContext({
    store: new SupabaseDataStore(sessionClient),
    sms: new TwilioSmsGateway({
      accountSid: env("TWILIO_ACCOUNT_SID"),
      authToken: env("TWILIO_AUTH_TOKEN"),
      from: env("TWILIO_FROM"),
    }),
    scheduler: new SupabaseScheduler(createServiceClient()),
    notifier: new ConsoleNotifier(),
  });
}
