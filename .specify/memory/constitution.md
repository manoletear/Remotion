<!--
Sync Impact Report
- Version change: template → 1.0.0 (initial ratification)
- Modified principles: n/a (first fill)
- Added sections: all (Core Principles I-VI, Additional Constraints, Development Workflow, Governance)
- Removed sections: none
- Templates requiring updates: plan-template.md ✅ (Constitution Check gate references these principles),
  spec-template.md ✅ (no change needed, generic), tasks-template.md ✅ (no change needed, generic)
- Follow-up TODOs: none — derived directly from ARCHITECTURE.md and docs/ANALYSIS.md, no placeholders deferred.
-->

# CondoGATE Constitution

## Core Principles

### I. RTU as Infrastructure Adapter, Never a Business Actor
The RTU5024 gate device is reached exclusively through the SMS Gateway port. Skills and
orchestration code MUST NOT construct or interpret RTU protocol bytes directly — that
logic lives only in `skills/rtu/protocol.ts`. The domain model is `PERMISO -> ACTIVACION ->
DISPOSITIVO`; the device is the last link, not the center of the design. Rationale: the
hardware is fixed, proprietary, and SMS-only — coupling business logic to it would make the
system untestable and unportable to a future RTU brand.

### II. Ports & Fakes Before Real Adapters (NON-NEGOTIABLE)
Every external dependency (persistence, SMS gateway, scheduler, notifications) is defined as
a port (interface) with an in-memory fake and a real adapter that satisfy the same contract.
A feature is not done until its full lifecycle passes against the fakes in
`src/**/*.test.ts` — no feature may depend on live hardware or live Twilio credentials to be
verified. Rationale: RTU5024 access and Twilio numbers are scarce/slow to provision; fakes
keep the loop fast and deterministic (`src/lifecycle.test.ts` proves this end-to-end).

### III. Dispatch and Confirmation Are Always Decoupled
Any operation that talks to the RTU over SMS MUST separate the dispatch (send command, stamp
`sent_at`, move to an in-flight state) from the confirmation (read the async reply, resolve
to a terminal state). No code path may block a request or a scheduler tick waiting for a
device reply. Rationale: the platform runs on serverless functions with a hard wall-clock
budget (tick must finish in <10s) and the device answers asynchronously over SMS.

### IV. Immutable Audit Trail
Every invitation state transition, RTU command dispatched, and confirmation/error received
MUST append an event to the `eventos` table. Events are append-only — no update or delete
path may exist for them. Rationale: this system authorizes physical access to a condominium;
administrators and residents must be able to reconstruct who authorized what and when,
without exception.

### V. Multi-Tenant Isolation at the Database Level
Row Level Security in Postgres — not application-layer filtering — is the authority for
tenant isolation. A resident's session client MUST only ever be able to read/write rows
scoped to their own `propiedad_id`; the scheduler/worker MUST run under the service role,
never a resident session. Rationale: leaking one condominium's access data to another is a
physical-security failure, not a cosmetic bug — ANALYSIS.md flags this as a hard requirement,
not a nice-to-have.

### VI. Idempotent, Deterministic Slot Assignment
RTU phonebook slot assignment MUST be deterministic and safe to re-run: re-processing the
same sync operation must never duplicate a device entry or corrupt another invitation's
slot. Slots 100–200 are reserved for invitations, 1–99 for permanent residents, enforced by
a partial unique index on `(dispositivo_id, rtu_slot)`. Rationale: retries after SMS timeouts
or serverless cold starts are expected, routine behavior, not an edge case.

## Additional Constraints

- **Stack**: TypeScript (Node >=20) for the domain package; Next.js (App Router) for the
  resident web app; Supabase (Postgres + Auth + RLS) for persistence; Twilio REST API for
  SMS — no SDK dependency beyond `fetch`.
- **Serverless budget**: any code invoked from a Vercel Cron route or API route MUST
  complete well under the platform's execution timeout; long-running work is not permitted
  outside the scheduler's incremental `tick`.
- **Locale**: phone numbers are E.164 internally; `DEFAULT_COUNTRY_CODE=+56` normalizes local
  input. The RTU's own wire format (no leading `+`) is a protocol-layer concern confined to
  `skills/rtu/protocol.ts` and must never leak into stored or compared values elsewhere.
- **Inbound webhook security**: any HTTP endpoint that accepts a device/Twilio-originated
  event (e.g. `/api/sms/inbound`) MUST validate the request signature before trusting its
  payload — an unauthenticated inbound endpoint that can flip `ACTIVE`/`REMOVED` state is a
  physical-access vulnerability, not a hardening nice-to-have.

## Development Workflow

- Every change to `src/skills`, `src/orchestration`, or `src/mcp` ships with a passing
  `npm test` run (`node --test`) — a red test blocks merge, it does not get skipped or
  deferred.
- Schema changes are additive migrations under `supabase/migrations/`, numbered
  sequentially; table/enum names mirror `shared/enums.ts` exactly.
- A feature is not "done" merely because the library-level lifecycle test passes — if the
  feature has a production entry point (an HTTP route, a cron target, a webhook), that entry
  point must exist and be wired before the feature is considered complete.

## Governance

This constitution supersedes ad hoc practice for the CondoGATE codebase. Amendments require:
a stated rationale, a version bump per the policy below, and an update to any template or
command file whose guidance the amendment invalidates. `/speckit-plan`'s Constitution Check
gate MUST cite the specific principle(s) evaluated; unjustified violations block planning.

**Versioning policy**: MAJOR — a principle is removed or reversed; MINOR — a principle or
constraint is added; PATCH — wording/clarification only, no normative change.

**Version**: 1.0.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-07-09
