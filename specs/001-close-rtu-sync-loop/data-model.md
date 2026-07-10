# Data Model: Close the RTU Sync Loop in Production

This feature introduces **no new tables and no schema changes**. It wires production entry
points to entities that already exist. Documented here for traceability to the spec's Key
Entities.

## `jobs` (existing — migration `0002_scheduler_jobs.sql`)

Read by `tick()` via `ctx.scheduler.due(now)`. Represents the "Ciclo automático" key entity
from the spec — a due `ACTIVATION`/`EXPIRATION`/`RETRY` job is what a scheduled `/api/tick`
invocation drains. No column changes.

## `inbound_sms` (existing — migration `0003_reconciler.sql`)

```text
id           uuid primary key
from_number  text not null        -- device/RTU number the reply came from
body         text not null        -- raw SMS reply body
received_at  timestamptz not null -- when the webhook received it
consumed_at  timestamptz          -- null until a reconciler pass consumes it
```

Represents the spec's "Confirmación entrante" key entity. This feature adds:

- A **writer**: `/api/sms/inbound` route inserts a row here after signature verification —
  it does not read or interpret `body`, only persists it (interpretation stays in
  `skills/rtu/protocol.ts` per Constitution I).
- A **reader**: the new `pollInbound` implementation (`src/mcp/supabase/inbound_sms.ts`)
  selects the oldest unconsumed row `where from_number = $1 and received_at >= $2 and
  consumed_at is null`, and stamps `consumed_at = now()` in the same transaction/call —
  matching `TwilioConfig.pollInbound`'s existing "consuming" contract in
  `src/mcp/sms_gateway/twilio.ts`.

No index changes — `inbound_sms_unconsumed_idx` already covers this exact query shape.

## `invitaciones` / `eventos` (existing)

Unchanged by this feature. `confirmInFlight` (already implemented) continues to read
`sent_at`/`estado`/`dispositivo_id` and write `eventos` rows exactly as it does today
against the fake gateway — the only difference in production is that `pollInbound` now
returns real data instead of always `null`.

## State transitions

No new states and no changed transition rules. This feature makes the **existing**
`invitation_lifecycle.ts` state machine (`ARCHITECTURE.md`'s `CREATED → PENDING_SYNC →
ACTIVE → EXPIRED → REMOVING → REMOVED`, with `ERROR`/`RETRY` branches) reachable end-to-end
in a real deployment, rather than only in tests and the manual-button demo.
