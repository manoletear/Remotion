# Implementation Plan: Owner Onboarding via Admin Invitation

**Branch**: `005-owner-onboarding` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-owner-onboarding/spec.md`

## Summary

Replace the manual, admin-runs-SQL step that links an auth account to a `residentes` row with
a self-service invite/claim flow. An admin creates an owner invitation (phone and/or email +
property); the system creates a pending-claim `residentes` row (tipo RESIDENT) immediately —
including real permanent RTU access, exactly like `addFamilyMember`/`addEmployee` already do
for family and employees — and sends a single-use, expiring claim link over SMS/email. The
invited owner authenticates via the existing magic-link/OTP flow and the claim link
automatically creates their `perfiles` row linked to that resident, replacing today's
`update perfiles set residente_id = ...` step. No new resident-facing capability is added —
once claimed, the owner has exactly what a resident has today.

## Technical Context

**Language/Version**: TypeScript (Node >=20) for the domain package; same as the rest of the
repo — no new language/runtime.

**Primary Dependencies**: Supabase Auth (magic-link/OTP, already integrated) for the claim
step's authentication; Twilio REST API (already integrated) for the SMS channel; Node's built-in
`crypto.randomBytes` for the claim token (no new dependency — deliberately not a third-party
token/JWT library, since the token is a single opaque lookup key, not a signed credential).

**Storage**: Postgres via Supabase — one new table (`owner_invitations`), no change to the
`residentes` schema (003 already gave it everything an owner invitation needs to create: tipo,
telefono, RTU sync fields).

**Testing**: `node --test` against in-memory fakes (Constitution II) — the invite/claim skills
and the token lifecycle (issue, single-use, expiry, invalidation-on-reinvite) are pure domain
logic and fully testable without Supabase or Twilio.

**Target Platform**: Vercel serverless (Next.js API routes / Server Actions) — same as every
other feature in this repo.

**Project Type**: Web application (existing monorepo: `src/` domain package + `web/` Next.js app).

**Performance Goals**: N/A — an admin action invoked a handful of times per onboarding batch,
not a hot path.

**Constraints**: The claim route is reached by someone with **no session and no `perfiles`
row yet** — it cannot rely on RLS the way every other resident-facing page does (RLS helpers
like `current_propiedad_id()` all key off an existing `perfiles` row). The claim action MUST
run under the service role and MUST itself validate the token (exists, unclaimed, unexpired)
before creating anything — the same class of "untrusted caller, validate before trusting"
discipline the constitution already requires for the Twilio inbound webhook, applied here to a
link instead of a signed request.

**Scale/Scope**: One condominium's admin onboarding a few to a few dozen owners at a time — no
bulk-import requirement in this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. RTU as Infrastructure Adapter**: Not implicated — this feature never touches RTU
  protocol bytes. Where it does grant real gate access (creating the RESIDENT row), it reuses
  `permanent_access_sync.ts`'s existing `syncAddPermanent` untouched, the same way
  `addFamilyMember`/`addEmployee` already do. **Pass.**
- **II. Ports & Fakes Before Real Adapters (NON-NEGOTIABLE)**: New `OwnerInvitationRepository`
  port gets an `InMemoryDataStore` fake alongside the real Supabase adapter, same as every
  existing repository; the invite/claim skills are proven against the fake in
  `src/*.test.ts` before any Supabase/Twilio wiring. **Pass, by construction — see Phase 1.**
- **III. Dispatch and Confirmation Decoupled**: Not implicated — no new RTU SMS command is
  introduced by this feature (the invitation SMS/email is a notification, not an RTU
  dispatch/confirm cycle). **N/A.**
- **IV. Immutable Audit Trail**: Invitation lifecycle (created, claimed, expired, invalidated)
  appends to `eventos` the same way every other state transition in this system does —
  `entidad='RESIDENT'`, new `event_type` values (`OWNER_INVITED`,
  `OWNER_INVITATION_CLAIMED`, `OWNER_INVITATION_INVALIDATED`). **Pass, see data-model.md.**
- **V. Multi-Tenant Isolation at the Database Level**: Creating an invitation is RLS-gated to
  admins of the target property's condominium (mirrors 004's `is_admin_for_condominio`).
  Claiming one is the one deliberate, documented exception to "RLS is the only path": the
  claiming caller has no tenant scope yet by definition, so the claim Server Action runs under
  service role and re-derives the scope itself (token → invitation → resident →
  propiedad_id) before writing anything — never trusting client-supplied IDs. **Pass, with the
  service-role exception justified above (same shape as the admin-provisioned link it
  replaces, which was already service-role).**
- **VI. Idempotent, Deterministic Slot Assignment**: Not reimplemented — the RESIDENT row this
  feature creates goes through the same `syncAddPermanent` slot assignment 003 already built
  and tested. **Pass, by reuse.**

No violations requiring the Complexity Tracking table.

**Re-checked after Phase 1 design** (data-model.md, contracts/, research.md): the two additions
that weren't visible before research — a new `NotificationChannel` value + two real adapters,
and the documented service-role exception for the claim route — don't introduce new violations;
both are named and justified above (II applies to the new repository as designed; V's exception
is scoped to the one step where no session exists yet, same shape as what it replaces). Gate
still passes.

## Project Structure

### Documentation (this feature)

```text
specs/005-owner-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0009_owner_invitations.sql      # owner_invitations table + RLS + new event_type values

src/
├── shared/
│   └── enums.ts                    # + OwnerInvitationStatus, new EventType values
├── mcp/supabase/
│   ├── port.ts                     # + OwnerInvitationRepository, NewOwnerInvitation types
│   ├── in_memory.ts                # + in-memory fake
│   └── supabase_store.ts           # + real adapter
└── skills/onboarding/
    ├── invite_owner.ts             # admin action: create pending resident + invitation + send
    └── claim_invitation.ts         # claim action: validate token, link perfiles, close invitation

web/
├── app/admin/propiedades/
│   ├── invite-owner-form.tsx       # admin form (+ optional Contact Picker, User Story 3)
│   └── actions.ts                  # invitarPropietarioAction (calls inviteOwner)
├── app/reclamar/[token]/
│   ├── page.tsx                    # public claim landing page (token in URL)
│   └── actions.ts                  # reclamarInvitacionAction (calls claimInvitation)
├── lib/
│   └── notify-owner.ts             # sends the claim link via email (Supabase) and/or SMS (Twilio)
└── middleware.ts                   # + "/reclamar" added to PUBLIC_PATHS (no session yet)
```

**Structure Decision**: Extends the existing monorepo layout exactly — no new project, no new
package. `skills/onboarding/` is a new subdirectory following the same `skills/household/`
precedent from 003 (a small, self-contained group of skills for one feature). The claim page
lives outside `web/app/admin/` and outside the resident route set, since its caller is neither
an admin nor an existing resident — it needs its own entry in `middleware.ts`'s public-path
allowlist, the same way `/login` already is.

## Complexity Tracking

*No violations — table omitted.*
