# Implementation Plan: Close the RTU Sync Loop in Production

**Branch**: `001-close-rtu-sync-loop` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-close-rtu-sync-loop/spec.md`

## Summary

The domain/orchestration layer (`tick`, `confirmInFlight`, `syncAddAccess/RemoveAccess`)
already implements the full activate → confirm → expire → confirm lifecycle and passes
against the fake SMS gateway. What is missing is entirely at the production edge: nothing
invokes `tick` on a schedule, nothing captures the RTU's inbound SMS reply into the
already-existing `inbound_sms` table, and the `TwilioSmsGateway` instance used by the web
app has no `pollInbound` implementation wired in — so `confirmInFlight` always sees "no
reply yet," forever. This plan adds: a scheduled `/api/tick` route, a signature-verified
`/api/sms/inbound` webhook route, a Supabase-backed `pollInbound` implementation, and fixes
to the two stale unit-test assertions the protocol-layer fix (commit `35f6936`) left behind.

## Technical Context

**Language/Version**: TypeScript, Node >=20 (package), Next.js 16 App Router (web)

**Primary Dependencies**: `@supabase/supabase-js` / `@supabase/ssr` (already in use),
Next.js Route Handlers, Node's built-in `crypto` module (Twilio signature verification —
no new SDK dependency, consistent with the existing `fetch`-only Twilio adapter)

**Storage**: Supabase Postgres — `inbound_sms` (already exists, migration `0003`), `jobs`
(already exists, migration `0002`). No new tables required.

**Testing**: `node --test` via `tsx` (existing `src/**/*.test.ts` convention)

**Target Platform**: Vercel serverless (Next.js Route Handlers), cron-triggered

**Project Type**: Web application — existing `web/` (Next.js) + `src/` (domain package)
monorepo-style layout; this feature only adds files under `web/app/api/`, `web/lib/`, and
one adapter in `src/mcp/supabase/`.

**Performance Goals**: `/api/tick` must complete well under Vercel's serverless execution
limit for a once-a-minute invocation processing a small due-job batch (tens, not thousands,
per the Scale/Scope in `docs/ANALYSIS.md`).

**Constraints**: No blocking waits on RTU replies (Constitution III); inbound webhook MUST
verify the provider signature before trusting payload (Constitution "Additional
Constraints" / spec FR-005); tick must remain safely re-entrant if Vercel Cron ever
double-fires (spec Edge Cases — duplicate reply handling).

**Scale/Scope**: Single condominium (MVP), 100–1,000 invitations/month, 2 SMS per
invitation — this feature does not change that scale envelope, only makes the existing
design reachable in production.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. RTU as infrastructure adapter | New code (webhook, tick route) calls only `tick()` and the `SmsGatewayPort`/`inbound_sms` store — no route touches RTU protocol bytes directly | PASS |
| II. Ports & fakes before real adapters | `pollInbound` is added as a Supabase-backed implementation behind the existing `TwilioConfig.pollInbound` seam; the fake gateway path (`src/lifecycle.test.ts`) is untouched | PASS |
| III. Dispatch/confirmation decoupled | `/api/tick` calls the existing non-blocking `tick()`; the webhook only inserts a row into `inbound_sms` and returns — it does not resolve invitation state itself | PASS |
| IV. Immutable audit trail | No change to `eventos` writes; confirmation events continue to be emitted by `confirmInFlight`/skills, unchanged | PASS |
| V. Multi-tenant isolation via RLS | `/api/tick` and `/api/sms/inbound` both run under the service-role client (`createServiceClient`), per the existing documented convention ("Use for: admin seed, scheduler (tick worker), inbound webhook") | PASS |
| VI. Idempotent slot assignment | Not touched by this feature — no slot-assignment code is modified | PASS |
| Additional Constraint: inbound webhook signature | Explicit FR-005 + a dedicated user story (US3); addressed in Phase 1 contracts | PASS (addressed, not deferred) |

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-close-rtu-sync-loop/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   ├── api-tick.md
│   └── api-sms-inbound.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
Remotion/
├── src/                              # domain package (existing, mostly unchanged)
│   ├── orchestration/
│   │   └── invitation_lifecycle.ts   # tick() — already implements the loop; unchanged
│   ├── mcp/
│   │   └── supabase/
│   │       └── inbound_sms.ts        # NEW: pollInbound-compatible read/mark-consumed helper
│   └── lifecycle.test.ts             # 2 assertions fixed (stale '+' expectation)
│
├── web/                               # Next.js resident app (existing)
│   ├── app/
│   │   └── api/                      # NEW directory
│   │       ├── tick/route.ts         # NEW: cron entry point
│   │       └── sms/
│   │           └── inbound/route.ts  # NEW: Twilio webhook (signature-verified)
│   └── lib/
│       ├── context.ts                # EDIT: wire pollInbound into TwilioSmsGateway
│       └── twilio_signature.ts       # NEW: request-signature verification helper
│
├── vercel.json                        # NEW: cron schedule for /api/tick
└── .env.example                       # EDIT: add CRON_SECRET
```

**Structure Decision**: Follows the existing two-part layout (`src/` domain package + `web/`
Next.js app) already established by the M0–M2 work — this feature adds no new top-level
project, only fills in the missing production entry points inside the structure that
already exists.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
