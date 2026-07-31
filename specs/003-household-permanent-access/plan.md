# Implementation Plan: Household Profile & Permanent Access

**Branch**: `003-household-permanent-access` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-household-permanent-access/spec.md`

## Summary

Extend the existing `residentes` table (already the domain's "permanent person"
concept — `ARCHITECTURE.md` already calls it "permanent" alongside temporary
invitations) with a `tipo` discriminator (RESIDENT/FAMILIAR/EMPLEADO), RUT/patente
fields for employees, and the same RTU-sync fields invitations already have
(`dispositivo_id`, `rtu_slot`, `sent_at`, `sync_attempts`, `last_error`, plus a new
`residente_status` enum). Add a **new, parallel** orchestration engine
(`permanent_access_sync.ts`) mirroring `rtu_sync.ts`'s dispatch/confirm shape but
targeting residents and slots 1-99 instead of invitations and slots 100-200 —
deliberately not a refactor of the proven, tested invitation engine (see research.md).
Add a `mascotas` table (name + photo, zero device interaction) with Supabase Storage
for photos. Generalize the `jobs` table's `invitation_id` FK to a polymorphic
`entity_id` (no FK) so permanent-access RETRY jobs can be scheduled the same way
invitation RETRY jobs already are — this mirrors `eventos.entidad_id`, which already
uses that exact bare-uuid pattern for the same reason.

## Technical Context

**Language/Version**: TypeScript, Node >=20 (domain package), Next.js 16 App Router (web)

**Primary Dependencies**: None new for the domain package. Web app adds
`@supabase/supabase-js`'s Storage client (already a transitive part of the existing
dependency, no new package) for pet photo upload/delete.

**Storage**: Supabase Postgres — new migration `0006_household_permanent_access.sql`
(residentes columns + enum, `mascotas` table, `jobs.invitation_id` → `entity_id`).
Supabase Storage — new bucket `mascotas-fotos`, RLS-equivalent storage policies scoped
by a `{propiedad_id}/...` path prefix matching `current_propiedad_id()`.

**Testing**: `node --test` via `tsx`, same convention as `src/lifecycle.test.ts` — new
tests for the permanent-access engine (mirroring the existing invitation lifecycle
tests: happy path, failed add, ack timeout, retry-recovers, slot reuse) and for RUT
validation.

**Target Platform**: Same Next.js web app (resident-facing forms) + domain package
(new skills/orchestration) + same Vercel Cron `/api/tick` (extended to also sweep
permanent-access confirmations).

**Performance Goals**: No change to existing budgets; permanent-access dispatch is
synchronous-triggered (on "add"), not scheduler-driven like invitation activation, so
it does not add scheduler load — only adds to the per-tick confirmation sweep.

**Constraints**: Slots 1-99 are a hard, condominium-wide shared resource (not
per-property) — the spec's FR-009/SC-006 requirement to fail clearly when exhausted is
a hard constraint on `assignSlot`'s permanent-access counterpart. RUT is sensitive PII
(FR-010) — never in audit payloads or notifications, matching the existing
phone-number-exclusion precedent in `createInvitation`'s `auditEvent` call.

**Scale/Scope**: Same MVP scale as the rest of the project (1 condominium, tens of
residents/family/employees per property, not hundreds) — the 99-slot ceiling is the
real limiting factor, not throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. RTU as infrastructure adapter | New sync engine composes the same `skills/rtu/protocol.ts` primitives (`rtuAddUser`/`rtuRemoveUser`) — no new protocol-byte handling anywhere else | PASS |
| II. Ports & fakes before real adapters | New engine tested against the existing `InMemoryDataStore`/`FakeSmsGateway`, same as invitations — no feature is considered done until it passes there first | PASS |
| III. Dispatch/confirmation decoupled | The whole point of mirroring `rtu_sync.ts`'s shape rather than inventing something new is to preserve this exact guarantee for permanent access too | PASS |
| IV. Immutable audit trail | Every dispatch/confirm/fail emits the existing `RTU_SYNC_*` event types against `EntityType.RESIDENT` (already defined, unused until now); RUT is explicitly excluded from payloads (FR-010) | PASS |
| V. Multi-tenant isolation via RLS | New `residentes` columns inherit the table's existing RLS policies unchanged; new `mascotas` table and storage bucket get equivalent property-scoped policies from day one, not added later | PASS |
| VI. Idempotent, deterministic slot assignment | Permanent-access slot assignment reuses the exact `occupiedSlots`-based scan pattern, just over `RESIDENT_SLOT_START..INVITATION_SLOT_START-1` instead of `INVITATION_SLOT_START..MAX_SLOTS`, and the same DB unique-index shape (extended to cover residentes) | PASS |
| Dev Workflow: passing `npm test` required | New engine ships with its own test coverage mirroring `lifecycle.test.ts`'s existing invitation cases | PASS |

**Deliberate non-refactor**: not extending `rtu_sync.ts` to be generic over
invitations-or-residents. See research.md's "Decision: parallel engine, not a shared
generic one."

No unjustified violations — Complexity Tracking below notes the one deliberate
duplication decision, justified there and in research.md.

## Project Structure

### Documentation (this feature)

```text
specs/003-household-permanent-access/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   ├── household-skills.md      # addFamilyMember/addEmployee/removeHouseholdMember
│   └── pet-skills.md            # addPet/removePet
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root, `Remotion/`)

```text
src/
├── domain/
│   └── resident/index.ts         # EDIT: tipo, rut, patente, rtu_slot, dispositivo_id,
│                                     sent_at, sync_attempts, last_error, estado fields
├── shared/
│   ├── enums.ts                  # EDIT: add ResidentStatus enum
│   └── validators.ts             # EDIT: add rut() validator (Chilean check-digit)
├── orchestration/
│   ├── rtu_sync.ts                # UNCHANGED — proven invitation engine, not touched
│   ├── permanent_access_sync.ts   # NEW — mirrors rtu_sync.ts for residentes
│   └── invitation_lifecycle.ts    # EDIT: tick() also calls confirmInFlightPermanent()
├── skills/
│   ├── household/
│   │   ├── add_family_member.ts   # NEW
│   │   ├── add_employee.ts        # NEW
│   │   └── remove_household_member.ts  # NEW
│   └── pets/
│       ├── add_pet.ts             # NEW (metadata only; photo upload is web-layer)
│       └── remove_pet.ts          # NEW
└── mcp/supabase/
    ├── port.ts                    # EDIT: ResidentPatch grows the new sync fields;
    │                                 new PetRepository
    ├── supabase_store.ts          # EDIT: pets CRUD; residents patch covers new fields
    └── in_memory.ts                # EDIT: same, for tests

supabase/migrations/
└── 0006_household_permanent_access.sql   # NEW

web/
├── app/
│   ├── perfil/                     # NEW: household profile page (family/employees/pets)
│   │   ├── page.tsx
│   │   └── actions.ts
│   └── api/pets/photo/route.ts     # NEW: upload proxy to Supabase Storage (decided
│                                      in research.md)
└── lib/
    └── rut.ts                       # NEW: client-side RUT format hint (server is
                                        the source of truth via shared/validators.ts)
```

**Structure Decision**: Extends the existing layered structure (`domain` → `skills` →
`orchestration` → `mcp`) exactly as invitations do — no new architectural layer, just
new modules within the existing ones, plus one new resident-facing route group
(`web/app/perfil/`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Duplicate sync engine (`permanent_access_sync.ts` vs. generalizing `rtu_sync.ts`) | Isolates a brand-new, less-battle-tested code path from the proven invitation engine that `001` already shipped to production | A shared generic engine (parameterized over "invitation or resident") would touch the one piece of this codebase with the most at stake (physical access already relied upon) for a feature whose access pattern (no expiration, admin-adjacent data like RUT) differs enough that the abstraction would need several branches anyway — see research.md |
