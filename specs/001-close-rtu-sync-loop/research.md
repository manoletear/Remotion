# Research: Close the RTU Sync Loop in Production

No `[NEEDS CLARIFICATION]` markers were left in the spec or Technical Context. This
document records the decisions behind the choices made in `plan.md`, for traceability.

## Decision: Cron trigger mechanism

**Decision**: Vercel Cron via `vercel.json` (`crons: [{ path: "/api/tick", schedule: "*
* * * *" }]`), with the route itself checking a shared-secret header/query param against
`CRON_SECRET` before calling `tick()`.

**Rationale**: `docs/ANALYSIS.md` already names "Vercel Cron → `POST /api/tick`" as the
intended integration and "`CRON_SECRET` protege `/api/tick`" as an existing assumption —
this is completing a documented design, not choosing a new one. Vercel Cron issues GET
requests by convention; the route accepts GET and reads the secret from the
`Authorization: Bearer <CRON_SECRET>` header Vercel sends automatically for cron
invocations, falling back to none in local dev (blocked unless `CRON_SECRET` is unset in a
non-production `NODE_ENV`, to keep local `curl` testing possible per quickstart.md).

**Alternatives considered**: A separate long-running worker process — rejected, the
project has no infrastructure for one and `docs/ANALYSIS.md` explicitly rules out
long-running processes ("Serverless (Vercel): sin procesos long-running").

## Decision: Twilio inbound signature verification

**Decision**: Implement verification directly with Node's built-in `crypto` module
(HMAC-SHA1 of the full callback URL + sorted POST parameters, base64-encoded, compared to
the `X-Twilio-Signature` header — Twilio's documented `RequestValidator` algorithm),
rather than adding the `twilio` npm package.

**Rationale**: The existing `TwilioSmsGateway` adapter already avoids the Twilio SDK in
favor of raw `fetch` ("`send` calls the Twilio Messages REST API directly via fetch (no
SDK needed)") — matching that convention keeps a single dependency-boundary style rather
than introducing an SDK for one function. The algorithm is a documented, stable public
spec (unchanged since Twilio's original webhook security design) and is ~20 lines of HMAC
code.

**Alternatives considered**: `twilio` npm package's `validateRequest` helper — rejected
only for consistency with the existing no-SDK convention; either is cryptographically
equivalent. If the team later needs more Twilio surface area (e.g. outbound via SDK
niceties), revisit and consolidate on the SDK everywhere at that point rather than mixing.

## Decision: `pollInbound` query shape

**Decision**: A single Supabase query against the existing `inbound_sms` table — already
indexed for this exact access pattern (`inbound_sms_unconsumed_idx` on `(from_number,
received_at) where consumed_at is null`, added in migration `0003`) — selecting the oldest
unconsumed row `from = <device number>` with `received_at >= sinceIso`, then marking it
`consumed_at = now()` in the same call site. No new table or index is needed.

**Rationale**: This table and index were already built for exactly this purpose (the
migration's own comment: "consumed (marked) by the reconciler when it confirms an
in-flight command") but never had a reader wired up — this is closing an existing gap, not
designing new storage.

**Alternatives considered**: None — the schema already dictates the shape.

## Decision: Idempotency under a double-fired cron tick

**Decision**: Rely on the existing job-completion contract: `tick()` marks each due job
`complete` via `ctx.scheduler.complete(job.id)` before moving to the next, and
`confirmInFlight` only acts on invitations still in an in-flight status
(`PENDING_SYNC`/`REMOVING`) with an unconsumed `inbound_sms` row. A second concurrent/late
tick invocation finds no due jobs left and no unconsumed replies left, so it is a no-op.

**Rationale**: This behavior already exists in `src/orchestration/invitation_lifecycle.ts`
and `src/orchestration/rtu_sync.ts` — verified by the passing `"expireInvitation is
idempotent"` and `"cancellation whose removal fails retries toward removal, never
re-adds"` tests already in `src/lifecycle.test.ts`. This feature does not need to add new
idempotency logic, only confirm (via `quickstart.md`) that the production entry points
don't bypass it.

**Alternatives considered**: An explicit distributed lock around `/api/tick` — rejected as
unnecessary; the scheduler's own `due()`/`complete()` cursor and the reconciler's
consumed-row marking already provide the needed guarantee without extra infrastructure.
