import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "inbound_sms";

/** Unwrap a Supabase maybe-single response: throw on a real DB error, null if absent. */
function maybeOne<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Persist a raw inbound SMS reply from a device. Called by the Twilio inbound
 * webhook after signature verification — this function does not interpret
 * `body`; that stays `skills/rtu/protocol.ts`'s job (Constitution I).
 */
export async function recordInboundSms(
  db: SupabaseClient,
  from: string,
  body: string,
): Promise<void> {
  const res = await db.from(TABLE).insert({ from_number: from, body });
  if (res.error) throw new Error(res.error.message);
}

/**
 * `TwilioConfig.pollInbound`-compatible reader: the oldest unconsumed reply from
 * `from` received at/after `sinceIso`, atomically claimed (marked consumed) so a
 * concurrent/late `tick` invocation cannot consume the same reply twice. Returns
 * the reply body, or `null` if none is available (or another invocation claimed
 * it first).
 */
export async function pollInboundSms(
  db: SupabaseClient,
  from: string,
  sinceIso: string,
): Promise<string | null> {
  const candidate = maybeOne<{ id: string; body: string }>(
    await db
      .from(TABLE)
      .select("id, body")
      .eq("from_number", from)
      .gte("received_at", sinceIso)
      .is("consumed_at", null)
      .order("received_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  if (!candidate) return null;

  // Claim atomically: only succeeds if the row is still unconsumed, so a
  // concurrent tick racing on the same reply cannot both resolve it.
  const claimed = maybeOne<{ id: string }>(
    await db
      .from(TABLE)
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle(),
  );
  if (!claimed) return null;

  return candidate.body;
}
