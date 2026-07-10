import { recordInboundSms } from "gsm-gate-access-layer";
import { NextRequest, NextResponse } from "next/server";

import { createServiceClient, crossPackageClient } from "@/lib/supabase";
import { verifyTwilioSignature } from "@/lib/twilio_signature";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Twilio inbound SMS webhook: the RTU's asynchronous reply to a dispatched
 * command lands here. This route does not resolve any invitation's state —
 * it only persists the raw reply (`inbound_sms`) for the next scheduled
 * `tick` to consume via `pollInbound`, preserving the dispatch/confirmation
 * decoupling (Constitution III).
 *
 * FR-005 / User Story 3: a request without a valid Twilio signature is
 * rejected and writes nothing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const signature = request.headers.get("x-twilio-signature");
  // Must match exactly what's configured as the webhook URL in the Twilio
  // console — reconstructing from request headers would be spoofable by a
  // proxy; the site's own canonical URL is not.
  const url = `${env("NEXT_PUBLIC_SITE_URL")}/api/sms/inbound`;

  const valid = verifyTwilioSignature(url, params, signature, env("TWILIO_AUTH_TOKEN"));
  if (!valid) {
    // No entity to attribute this to in the audit trail: `eventos.entidad_id`
    // is NOT NULL, and a forged request's `From` may not match any registered
    // device — see specs/001-close-rtu-sync-loop/tasks.md T012 for the
    // follow-up (a nullable-entity security-event path). Logged, not silently
    // dropped, in the meantime.
    // eslint-disable-next-line no-console
    console.error("Rejected inbound SMS webhook: invalid Twilio signature", {
      from: params["From"],
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params["From"];
  const body = params["Body"];
  if (!from || !body) {
    return NextResponse.json({ error: "Missing From/Body" }, { status: 400 });
  }

  await recordInboundSms(crossPackageClient(createServiceClient()), from, body);
  return NextResponse.json({ ok: true });
}
