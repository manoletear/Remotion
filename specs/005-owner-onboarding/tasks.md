---

description: "Task list for feature implementation"
---

# Tasks: Owner Onboarding via Admin Invitation

**Input**: Design documents from `/specs/005-owner-onboarding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Domain-package unit tests are requested (Constitution II, NON-NEGOTIABLE) — the
invite/claim skills and the token/claim lifecycle must pass against in-memory fakes before any
Supabase/Twilio wiring, same discipline every prior feature followed.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and validation of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Paths are relative to `Remotion/` for `supabase/` and `src/`, and to `Remotion/web/` for the
web app — per `plan.md`'s Project Structure.

---

## Phase 1: Setup

- [X] T001 Write migration `supabase/migrations/0009_owner_invitations.sql` per data-model.md:
      `owner_invitation_status` enum, `owner_invitations` table (with the partial unique index
      on `resident_id where status='PENDING'` and the email-or-phone check constraint), the
      three new `event_type` values via `alter type ... add value` (mirrors 0005's precedent),
      and RLS (insert: admin of the target property's condominium only, mirroring 004's
      `is_admin_for_condominio`; select: admin of own condominium, mirroring 004's pattern —
      no resident-facing policy needed, the claim path runs service-role per research.md)

**Checkpoint**: The data layer and its RLS boundary exist independently of any application code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story can be implemented before these exist.

- [X] T002 [P] `src/shared/enums.ts`: add `OwnerInvitationStatus` (`PENDING`/`CLAIMED`/`INVALIDATED`)
      and the three new `EventType` values (`OWNER_INVITED`, `OWNER_INVITATION_CLAIMED`,
      `OWNER_INVITATION_INVALIDATED`)
- [X] T003 [P] `src/mcp/notifications/port.ts`: add `"SMS"` to `NotificationChannel` (today:
      `PUSH | WHATSAPP | EMAIL`)
- [X] T004 [P] `src/mcp/notifications/twilio.ts` (new): `TwilioNotifier` — real SMS adapter via
      the Twilio Messages API (`fetch`, no SDK, mirrors `TwilioSmsGateway`'s calling
      convention) — a distinct code path from `TwilioSmsGateway`, which stays reserved for RTU
      control traffic per the port's docstring (depends on T003)
- [X] T005 [P] `src/mcp/notifications/resend.ts` (new): `ResendNotifier` — real email adapter
      via Resend's fetch-based API, gated by an optional `RESEND_API_KEY`; if unset, `notify()`
      logs and resolves instead of throwing (research.md — degrades gracefully, does not block
      SMS-only invitations)
- [X] T006 `src/mcp/notifications/routing.ts` (new): `RoutingNotifier` — routes `SMS`→the real
      Twilio adapter, `EMAIL`→the real Resend adapter, and leaves `WHATSAPP`/`PUSH` on whatever
      fallback notifier it's given (today: `ConsoleNotifier`, since real WhatsApp/push remain
      explicitly out of scope) (depends on T004, T005)
- [X] T007 [P] `src/mcp/supabase/port.ts`: add `NewOwnerInvitation`, `OwnerInvitation`,
      `OwnerInvitationRepository` (create/findByTokenHash/claim, per data-model.md's Repository
      Port section) and add `ownerInvitations` to `DataStore`
- [X] T008 [P] `src/mcp/supabase/in_memory.ts`: in-memory fake implementing
      `OwnerInvitationRepository` — `claim()` must simulate the same atomic
      "first-writer-wins" semantics the real adapter has (reject if not `PENDING` or already
      expired), so tests against the fake actually prove the single-use guarantee (depends on T007)
- [X] T009 [P] `src/mcp/supabase/supabase_store.ts`: real adapter implementing
      `OwnerInvitationRepository` — `claim()` as one conditional
      `update ... where status='PENDING' and expires_at > now() returning *` (research.md);
      `create()` invalidates any prior `PENDING` invitation for the same `resident_id` in the
      same call (depends on T007)
- [X] T010 `web/lib/context.ts`: wire `RoutingNotifier` (backed by `TwilioNotifier`,
      `ResendNotifier`, and `ConsoleNotifier` as the WhatsApp/push fallback) into both
      `makeServerContext` and `makeSystemContext`, replacing the bare `ConsoleNotifier` those
      use today (depends on T006)
- [X] T011 `web/middleware.ts`: add `"/reclamar"` to `PUBLIC_PATHS` — the claim page's visitor
      has no session yet, same treatment `/login` already gets

**Checkpoint**: Every port, adapter, and RLS policy this feature needs exists; every user story
below is "just" skills + web pages on top of a settled foundation.

---

## Phase 3: User Story 1 - Admin invites a new owner (Priority: P1) 🎯 MVP

**Goal**: An admin can invite an owner by phone/email; the owner claims the link and lands in
their existing resident portal with no manual admin step.

**Independent Test**: Invite a real phone number, receive the SMS, open the link, authenticate,
and confirm the resulting account can use `/`, `/perfil`, `/historial`, `/invitar` normally
(quickstart.md Section 1).

- [X] T012 [P] [US1] `src/shared/tokens.ts` (new): `generateClaimToken()` (
      `crypto.randomBytes(32).toString("base64url")`) and `hashClaimToken(token)` (`sha256` hex)
      — pure helpers, no I/O (research.md)
- [X] T013 [US1] `src/skills/onboarding/invite_owner.ts` (new): `inviteOwner` — validates at
      least one of phone/email is given, checks (service-role, not exposed to the caller)
      whether the contact already resolves to an existing `auth.users` row and no-ops with the
      same success shape if so (FR-012), otherwise creates the `residentes` row (tipo
      `RESIDENT`), calls the existing `syncAddPermanent` unchanged, creates the
      `owner_invitations` row via T009's repository, sends the invitation through
      `ctx.notifier` on whichever channel(s) apply, and appends `OWNER_INVITED` (depends on
      T002, T009, T012)
- [X] T014 [US1] `src/skills/onboarding/claim_invitation.ts` (new): `claimInvitation` — hashes
      the raw token, looks up by hash, calls the repository's atomic `claim()`, inserts the
      `perfiles` row linking the authenticated auth user to the resident on success, appends
      `OWNER_INVITATION_CLAIMED`, and returns the three error shapes (`not_found`/`expired`/
      `already_used`) per contracts/owner-onboarding.md (depends on T002, T009, T012)
- [X] T015 [US1] `src/onboarding.test.ts` (new): against the in-memory fakes — happy path
      (invite → claim → perfiles linked, resident has real access), the no-enumeration no-op
      path, and claim failure on an unknown token (depends on T013, T014)
- [X] T016 [US1] `web/app/admin/propiedades/invite-owner-form.tsx` +
      `web/app/admin/propiedades/actions.ts`: admin invite form (name, phone, email, property
      select) and `invitarPropietarioAction` calling `inviteOwner` through `getCurrentAdmin()`'s
      context (depends on T013)
- [X] T017 [US1] `web/app/reclamar/[token]/page.tsx` + `web/app/reclamar/[token]/actions.ts`:
      public claim page — shows the existing magic-link/OTP login form if unauthenticated
      (carrying the token through to after auth), calls `claimInvitation` once authenticated,
      and redirects into `/` on success (depends on T014, T011)
- [X] T018 [US1] `web/lib/notify-owner.ts` (new): composes the invitation's title/body and the
      `https://.../reclamar/<token>` link, called by `inviteOwner` via `ctx.notifier` (depends
      on T012)
- [ ] T019 [US1] Validate quickstart.md Section 1 end-to-end with a real phone number

**Checkpoint**: User Story 1 fully functional and independently testable — this alone is a
shippable MVP.

---

## Phase 4: User Story 2 - Claim link cannot be hijacked or reused (Priority: P2)

**Goal**: A used, expired, or superseded claim link is always rejected, never silently accepted.

**Independent Test**: Reuse a claimed link, open an expired one, and re-invite a still-pending
owner to confirm the old link stops working (quickstart.md Section 2).

- [X] T020 [US2] Extend `src/onboarding.test.ts`: reuse-after-claim rejection, expiry rejection
      (unexpired-but-past-`expires_at` row), and reinvite-invalidates-prior-pending (depends on
      T015)
- [X] T021 [US2] `web/app/reclamar/[token]/page.tsx`: render the three distinct rejection
      messages (`not_found`/`expired`/`already_used`) per contracts/owner-onboarding.md's table
      (depends on T017)
- [ ] T022 [US2] Validate quickstart.md Section 2

**Checkpoint**: US1 + US2 together — the flow works and can't be abused via a leaked/reused link.

---

## Phase 5: User Story 3 - Pick the contact instead of typing (Priority: P3)

**Goal**: On supported browsers, the admin fills the invite form from their phone contacts in
one tap; everywhere else, manual entry works with no broken control shown.

**Independent Test**: Confirm the picker button appears and works on Android Chrome, and is
simply absent elsewhere (quickstart.md Section 3).

- [X] T023 [US3] `web/app/admin/propiedades/invite-owner-form.tsx`: feature-detect
      `"contacts" in navigator && "ContactsManager" in window`, render "elegir de contactos"
      only when present, and fill name/phone via `navigator.contacts.select(["tel","name"],
      {multiple:false})` (research.md) (depends on T016)
- [ ] T024 [US3] Validate quickstart.md Section 3 on both a supported and an unsupported browser

**Checkpoint**: All three user stories independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] `npm test` (domain package) — clean, including every new `src/onboarding.test.ts`
      case
- [X] T026 [P] `npm run build` + `npx tsc --noEmit` (web) — clean, `/admin/propiedades` and
      `/reclamar/[token]` routes registered, no regressions to existing routes
- [ ] T027 Validate quickstart.md Sections 4 (admin-only gate on invite creation, and the
      no-enumeration-leak boundary — FR-012's actual security promise, not just a nice screen)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: T002/T003/T007 have no dependencies on each other and can start
  immediately; T004/T005 depend on T003; T006 depends on T004+T005; T008/T009 depend on T007;
  T010 depends on T006; T011 has no dependency beyond Phase 1 existing.
- **User Stories (Phase 3-5)**: All depend on Phase 2 completing. US2 (Phase 4) extends US1's
  test file and claim page, so it depends on US1's T014/T015/T017 existing — not independent of
  US1 the way 004's three stories were of each other. US3 (Phase 5) similarly extends US1's
  invite form (T016), so it depends on US1.
- **Polish (Phase 6)**: Last.

### Parallel Opportunities

- T002, T003, T007 (Phase 2) — no shared files, can start together
- T004, T005 (Phase 2) — different files, both depend only on T003
- T012 (Phase 3) has no dependency on T013/T014 beyond existing first — can run alongside T007-T009
- T025, T026 (Phase 6)

---

## Implementation Strategy

### MVP First (User Story 1 alone is shippable)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1) — **STOP and VALIDATE**: quickstart.md Section 1 with a real phone number
3. Phase 4 (US2) — the security hardening that makes US1 safe to actually operate
4. Phase 5 (US3) — pure convenience, defer indefinitely without any loss of correctness
5. Phase 6 — polish, then deploy

### Incremental Delivery

Unlike 004 (three independent P1 stories shipped together), this feature has a real priority
order: US1 is the whole point, US2 is the security property that makes shipping US1 responsible
(a claim-link flow with no reuse/expiry protection is a genuine risk, not a corner someone should
cut), and US3 is optional polish that can land in a later pass with zero risk to what's already
shipped.

---

## Notes

- The real risk surface in this feature is entirely Phase 2 + Phase 4: the RLS policy on
  `owner_invitations` (can only an admin of the right condominium create one?), the atomic
  claim (can a link ever be used twice, even under concurrent requests?), and the
  no-enumeration check (does a re-invite of an already-registered contact ever leak that fact
  to the admin?). T027's validation is not optional polish — it's this feature's actual
  acceptance test.
- Every task names its exact file path; none require additional context to start.
- Commit after each phase or logical group; stop at each checkpoint to validate before moving on.
