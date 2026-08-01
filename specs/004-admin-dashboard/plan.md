# Implementation Plan: Admin Dashboard (Condominium-Wide, Read-Only)

**Branch**: `004-admin-dashboard` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-admin-dashboard/spec.md`

## Summary

Add an `ADMIN` value to `perfiles.rol` (already reserved for this — migration 0004's
own comment: "the seam for P1 admin roles ... just a new value + extra policies") plus
a new `perfiles.condominio_id` column so an admin account can be condo-scoped without
needing to also be a resident. Add RLS SELECT-only policies (permissive, additive to
the existing property-scoped ones) on `propiedades`/`residentes`/`invitaciones`/
`mascotas`/`dispositivos`/`eventos` so an admin sees every row belonging to their
condominium. Build a new `/admin` route group — visually distinct from the resident
portal's mobile-first design (`002`): a desktop-first SaaS admin layout (sidebar nav,
stat cards, data tables), per the user's explicit direction, sharing only the
underlying color/spacing tokens from `002`'s design system, not its mobile-first
layout patterns.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router (existing `web/` app)

**Primary Dependencies**: None new. Server Components + the existing Supabase clients.

**Storage**: New migration `0007_admin_dashboard.sql` — `perfiles.condominio_id`
column, `is_admin_for_condominio()` helper (mirrors `current_condominio_id()`'s
`security definer`/`stable` shape), and admin-scoped SELECT policies. No new business
tables — this feature is a read layer over data that already exists.

**Testing**: RLS policies are integration-level (need a real Postgres, not the
in-memory fakes) — validated via `quickstart.md`'s manual checks (an admin sees
cross-property data; a resident still doesn't), consistent with how RLS itself has
never had domain-package unit tests in this project (it's enforced entirely at the DB
layer, orthogonal to the `SkillContext`/`DataStore` port the fakes implement).

**Target Platform**: Same Next.js web app, new route group, desktop-first (SaaS
convention — admin tools are typically used at a desk, unlike the resident portal).

**Performance Goals**: No new scale concerns — same single-condominium MVP size
(`docs/ANALYSIS.md`).

**Constraints**: FR-006 — enforcement MUST be at RLS, not just hiding UI. FR-005 — must
not weaken existing resident isolation (additive policies only, nothing existing is
dropped or narrowed, unlike the `residentes` policy fix in `003` which *replaced* an
overly narrow one — here everything old stays exactly as it is, this only adds).

**Scale/Scope**: One condominium (today), one admin dashboard covering it; the design
scopes by `condominio_id` (not "everything in the database") specifically so a second
condominium wouldn't leak into a different one's admin view later.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. RTU as infrastructure adapter | Not touched — this feature is read-only reporting over existing data | N/A / PASS |
| II. Ports & fakes before real adapters | N/A — no new skill/orchestration logic; RLS is a DB-layer concern the fakes don't model | N/A |
| III. Dispatch/confirmation decoupled | Not touched | N/A / PASS |
| IV. Immutable audit trail | Not touched — admin only *reads* `eventos`, never writes | PASS |
| V. Multi-tenant isolation via RLS | The central mechanism of this feature — admin visibility is itself new RLS policies, condo-scoped, additive only (FR-005/FR-006) | PASS |
| VI. Idempotent, deterministic slot assignment | Not touched | N/A / PASS |

No violations — Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-admin-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── admin-rls.md              # the RLS policies themselves, as a contract
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

No new domain-package skills/contracts — this feature has no write path.

### Source Code (repository root, `Remotion/`)

```text
supabase/migrations/
└── 0007_admin_dashboard.sql      # NEW: perfiles.condominio_id, is_admin_for_condominio(),
                                     admin SELECT policies on propiedades/residentes/
                                     invitaciones/mascotas/dispositivos/eventos

web/
├── lib/
│   └── admin-session.ts          # NEW: getCurrentAdmin() — mirrors getCurrentResident(),
│                                    checks perfiles.rol === 'ADMIN', returns condominioId
└── app/
    └── admin/
        ├── layout.tsx             # NEW: sidebar nav + auth guard, desktop-first SaaS shell
        ├── page.tsx               # NEW: overview — stat cards (properties, active
        │                            residents/family/employees, active invitations)
        ├── bitacora/page.tsx      # NEW: condo-wide event log, property-labeled
        ├── propiedades/page.tsx   # NEW: household directory (every property's
        │                            residents/family/employees + access status)
        └── invitaciones/page.tsx  # NEW: condo-wide invitations list, property-labeled
```

**Structure Decision**: New route group (`web/app/admin/`) parallel to the existing
resident routes, with its own layout (distinct visual shell) but reusing the same
underlying design tokens (`globals.css` from `002`) — new components/CSS classes for
the SaaS-specific chrome (sidebar, stat cards), not a fork of the token system itself.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
