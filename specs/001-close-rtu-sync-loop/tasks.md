---

description: "Task list for feature implementation"
---

# Tasks: Close the RTU Sync Loop in Production

**Input**: Design documents from `/specs/001-close-rtu-sync-loop/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
(all present)

**Tests**: Explicitly requested by the spec (FR-009/SC-005 require the existing unit-test
regression fixed) and by `quickstart.md` (manual/curl integration validation per story).
No new unit-test framework is introduced.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and validation of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Paths are relative to `Remotion/` (the package root), per `plan.md`'s Project Structure —
`src/` (domain package) + `web/` (Next.js app).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Fix the two stale phone-format assertions in `src/lifecycle.test.ts` (lines
      asserting `+56911112222` in the RTU `ADD` command) so they match
      `buildAddUserCommand`'s current `+`-stripping behavior from commit `35f6936`. Run
      `npm test` and confirm `15/15` pass. (spec: Edge Cases, FR-009, SC-005)
- [X] T002 [P] Add `CRON_SECRET=` to `.env.example`, with a one-line comment that it
      protects `/api/tick` (research.md: cron trigger decision)
- [X] T003 [P] Add `vercel.json` with a `crons` entry: `{"path": "/api/tick", "schedule": "*
      * * * *"}` — placed at **`web/vercel.json`**, not `Remotion/vercel.json` as originally
      guessed here: `web/` (containing `next.config.mjs`/`package.json`) is the actual
      Vercel-deployable root, `Remotion/` is not. (research.md: cron trigger decision)

**Checkpoint**: Test suite is green; cron scaffolding exists but nothing calls it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: US1 can be demoed without this phase, but neither US1 nor US2 is
*functionally complete against a real device* until this phase lands — real Twilio
confirmations have nowhere to be read from otherwise.

- [X] T004 Implement an `inbound_sms` reader/consumer in
      `src/mcp/supabase/inbound_sms.ts`: given `(fromNumber, sinceIso)`, select the oldest
      unconsumed row (`consumed_at is null`, uses `inbound_sms_unconsumed_idx`), stamp
      `consumed_at = now()`, and return the row's `body` (or `null` if none) — matching the
      `pollInbound` signature already declared in `src/mcp/sms_gateway/twilio.ts`'s
      `TwilioConfig`. Also added `recordInboundSms` (the webhook-side writer, T009 needs it)
      in the same file, and exported both from `src/mcp/supabase/index.ts`. (data-model.md,
      research.md)
- [X] T005 Wired T004's function as `pollInbound` when constructing `TwilioSmsGateway` in
      `web/lib/context.ts`. Went further than the task's literal wording: added a
      `makeSystemContext()` builder alongside `makeServerContext()`, since `/api/tick` (T007)
      has no resident session/cookies to build a session client from — it needs a
      fully service-role context. Also surfaced and fixed a **dual-package-instance**
      TypeScript issue: `web/` and the domain package each install their own copy of
      `@supabase/supabase-js` (no npm workspace linking them), so `SupabaseClient` is two
      nominally-distinct types; added `crossPackageClient()` in `web/lib/supabase.ts` to
      document and bridge this at each boundary call. Real fix (npm workspaces) is a
      follow-up, not done here — see Notes.
- [X] T006 [P] Implemented Twilio request-signature verification in
      `web/lib/twilio_signature.ts` (HMAC-SHA1, Node's built-in `crypto`, no SDK). Verified
      against Twilio's actual published worked example (docs/usage/security) — not just unit
      tests — before trusting it.

**Checkpoint**: Real inbound replies can be read once a webhook writes them; a signature
verifier exists once a webhook route needs it.

---

## Phase 3: User Story 1 - Access activates and expires without anyone driving it by hand (Priority: P1) 🎯 MVP

**Goal**: A scheduled trigger drives `tick()` with no human interaction.

**Independent Test**: `curl http://localhost:3000/api/tick` returns a `TickReport` with no
manual dashboard click involved (quickstart.md step 2).

- [X] T007 [US1] Implemented `GET /api/tick` in `web/app/api/tick/route.ts` using
      `makeSystemContext()` from T005. Route builds and returns a 401/200 JSON response as
      specified in contracts/api-tick.md.
- [~] T008 [US1] **Partially validated — blocked on live credentials.** `npm test` is
      15/15 (step 1). `npm run build` compiles and lists `/api/tick` as a registered dynamic
      route with no type errors (verifies the route is wired and well-typed). Could not run
      the live `curl` steps 2/4 in this session: `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
      `TWILIO_FROM` are empty in `.env` (no Twilio number provisioned yet, confirmed with the
      user mid-implementation) — `makeSystemContext()` throws on missing env before the route
      body runs. Re-run this once Twilio credentials exist.

**Checkpoint**: The lifecycle advances on a real schedule; full `ACTIVE` resolution depends
on Phase 4 (US2) also being deployed.

---

## Phase 4: User Story 2 - The gate's own confirmation is what closes the loop (Priority: P1)

**Goal**: Inbound device replies are captured and resolve invitation state.

**Independent Test**: A correctly-signed webhook POST followed by a `/api/tick` call moves
a `PENDING_SYNC` invitation to `ACTIVE`; an unanswered command moves it to `ERROR` with a
scheduled retry (quickstart.md steps 4–5).

- [X] T009 [US2] Implemented `POST /api/sms/inbound` in
      `web/app/api/sms/inbound/route.ts` per contracts/api-sms-inbound.md. Built T012's
      rejection guard into the same route in the same pass (they share one file, as
      `tasks.md` Dependencies already anticipated).
- [ ] T010 [US2] **Blocked on live credentials** — same reason as T008. Needs a real Twilio
      number + a way to simulate/receive its inbound SMS reply to exercise end-to-end.
- [ ] T011 [US2] **Blocked on live credentials** — same reason as T008.

**Checkpoint**: US1 + US2 together deliver the feature's core promise — the loop closes
unattended, against real (or realistically simulated) device replies.

---

## Phase 5: User Story 3 - Only the real gate can report back (Priority: P2)

**Goal**: The inbound webhook rejects unverifiable requests before they can touch state.

**Independent Test**: An unsigned/forged POST to `/api/sms/inbound` is rejected with no
`inbound_sms` row written; a correctly-signed POST is accepted (quickstart.md step 3).

- [X] T012 [US3] Implemented in `web/app/api/sms/inbound/route.ts`: an invalid/missing
      signature returns `403` and `recordInboundSms` is never called (no row written).
      **Deviation from the task as written**: did *not* reuse `RTU_SECURITY_RISK` for the
      audit event — that enum value is device/phonebook-scoped and `eventos.entidad_id` is
      `NOT NULL`, but a forged request's `From` may not correspond to any registered device,
      leaving no valid id to attach the event to. Forcing a fake id would corrupt the audit
      trail's meaning (Constitution IV). Rejected attempts are `console.error`-logged with
      the `From` value instead — flagged explicitly as a schema gap (see Notes) rather than
      silently satisfied.
- [X] T013 [US3] **Validated the cryptographic core directly** (not via live `curl`, which
      is blocked per T008): ran `verifyTwilioSignature` against Twilio's own published
      worked example (URL, params, AuthToken `12345`, expected signature
      `L/OH5YylLD5NRKLltdqwSvS0BnU=` from docs.twilio.com/usage/security) — it matches
      exactly, and correctly rejects a forged/missing signature against the same inputs. The
      live HTTP round-trip (steps 3's `curl` calls) still needs a running dev server with
      real env, same blocker as T008.

**Checkpoint**: All three user stories are independently verifiable; the webhook is safe
to point a real Twilio number at.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T014 [P] Added the production-entry-points note to `ARCHITECTURE.md`'s "Main flow"
      section.
- [X] T015 [P] Updated `Projects/CondoGATE/CLAUDE.md`'s "Current status", "Next actions",
      and "Log".
- [~] T016 **Partial.** `npm test`: 15/15. `npm run build` (web): compiles, type-checks, and
      registers both new routes as dynamic endpoints — done as a stronger, code-level
      substitute for the parts of `quickstart.md` that don't need live Twilio. Steps 2, 4, 5
      (the actual `curl` round-trips against a running server + real Twilio number) remain
      unrun — same credentials blocker as T008/T010/T011. **SC-001–SC-004 unverified live;
      SC-005 (test suite green) verified.** Re-run this task in full once Twilio credentials
      are available; nothing else in this feature should block on it.

### Discovered during implementation (not in the original task list)

- Fixed pre-existing implicit-`any` TypeScript errors in `web/app/auth/callback/route.ts`,
  `web/middleware.ts`, and `web/lib/supabase.ts` (the `setAll` cookie callbacks) — these
  predate this feature and were only ever invisible because `web/node_modules` had never
  been installed before (see `crossPackageClient` finding above); `npm run build` could not
  otherwise pass its own TypeScript gate to let this feature's routes be smoke-tested.
- Added `"/api"` to `PUBLIC_PATHS` in `web/middleware.ts` — without it, the auth middleware
  redirected every unauthenticated request (including Vercel Cron hitting `/api/tick` and
  Twilio hitting `/api/sms/inbound`) to `/login`, which would have made both new routes
  unreachable in production despite being otherwise correct.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001, T002, T003 can all start immediately and run
  in parallel (different files)
- **Foundational (Phase 2)**: No hard dependency on Phase 1 completing, but logically
  follows it — T006 is parallelizable with T004; T005 depends on T004
- **User Stories (Phase 3+)**: US1 (T007–T008) only strictly depends on T005 for its full
  acceptance criteria (reaching `ACTIVE`); its route itself could be written right after
  Setup. US2 (T009–T011) depends on T006. US3 (T012–T013) depends on T006 and T009 (it
  extends the same route file).
- **Polish (Phase 6)**: After all desired stories are complete

### User Story Dependencies

- **US1 (P1)**: Independently deployable for "dispatch happens unattended"; full `ACTIVE`
  resolution in production needs US2 too — both are P1 and intended to ship together.
- **US2 (P1)**: Needs T006 (Foundational). Extends the same file US3 extends
  (`web/app/api/sms/inbound/route.ts`) — coordinate T009 and T012 to avoid a merge
  conflict if worked in parallel by different people.
- **US3 (P2)**: Needs US2's route (T009) to already exist — it is a guard added to that
  route, not a new one.

### Parallel Opportunities

- T001, T002, T003 (Phase 1) — different files
- T004 and T006 (Phase 2) — different files, no shared dependency
- T014 and T015 (Phase 6) — different files, docs-only

---

## Parallel Example: Phase 1 (Setup)

```bash
Task: "Fix stale phone-format assertions in src/lifecycle.test.ts"
Task: "Add CRON_SECRET to .env.example"
Task: "Add vercel.json with /api/tick cron schedule"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 together — both P1)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1: `/api/tick` exists and runs on schedule)
3. Phase 4 (US2: inbound replies actually resolve state) — **do not skip**; without it,
   US1's own acceptance scenario ("invitation reaches `ACTIVE`") does not hold against a
   real Twilio number, only against the fake gateway
4. **STOP and VALIDATE**: run quickstart.md steps 1–2, 4, 5 end-to-end
5. Deploy — the core promise (unattended access lifecycle) now holds in production

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 together → the MVP: unattended, confirmed activation/expiration → Deploy
3. US3 → hardens the webhook against forged requests → Deploy
4. Polish → docs catch up to reality

---

## Notes

- US1 and US2 are listed as separate stories per spec.md (each has its own independent
  test), but are **not** independently *complete* in production — see User Story
  Dependencies above. Treat them as one MVP delivery unit.
- Every task names its exact file path; none require additional context to start.
- Commit after each task or logical group; stop at each checkpoint to validate before
  moving on.
