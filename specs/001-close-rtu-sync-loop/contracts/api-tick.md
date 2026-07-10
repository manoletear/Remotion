# Contract: `GET /api/tick`

Production cron entry point. Drives User Story 1 (spec.md).

## Request

- **Method**: `GET` (Vercel Cron invokes cron routes with GET by convention)
- **Auth**: `Authorization: Bearer <CRON_SECRET>` header. In production, request MUST be
  rejected with `401` if the header is missing or does not match `process.env.CRON_SECRET`.
  In non-production environments where `CRON_SECRET` is unset, the check is skipped (local
  `curl`/manual testing, per `quickstart.md`).
- **Body**: none.

## Response

- **200 OK** — `{ "processed": number, "activated": number, "expired": number, "retried": number }`
  — the `TickReport` already returned by `tick()` in `src/orchestration/invitation_lifecycle.ts`,
  serialized as-is.
- **401 Unauthorized** — invalid/missing secret in production.
- **500 Internal Server Error** — an unexpected error escaped `tick()`'s own per-job
  isolation (should not happen in normal operation; `tick()` already catches and logs
  per-job failures without throwing).

## Behavior contract

1. Build a service-role `SkillContext` (`createServiceClient()` per `web/lib/supabase.ts`,
   `TwilioSmsGateway` with `pollInbound` wired, `SupabaseScheduler`, `ConsoleNotifier`).
2. Call `tick(ctx, new Date())` exactly once per invocation. No new business logic — this
   route is a thin trigger over the existing, already-tested `tick()`.
3. Return its `TickReport` as JSON.

## Non-goals

- This route does not itself talk to the RTU or interpret device replies — that remains
  entirely inside `tick()` → `confirmInFlight`/`activateInvitation`/`expireInvitation`.
- Idempotency/re-entrancy is inherited from `tick()`'s existing job-completion cursor (see
  `research.md`) — this contract adds no additional locking.
