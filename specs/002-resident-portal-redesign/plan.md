# Implementation Plan: Resident Portal Visual/UX Redesign

**Branch**: `002-resident-portal-redesign` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-resident-portal-redesign/spec.md`

## Summary

Formalize the existing dark-theme starting point (`web/app/globals.css`) into a real,
mobile-first design system — a typography/spacing scale, semantic color tokens (replacing
`web/lib/format.ts`'s ad-hoc per-status hex pairs), responsive breakpoints, and consistent
loading/error/empty states — applied across the three existing screens (login, dashboard,
invitation detail). No new pages, no new data, no new backend surface: this is a styling and
interaction-quality pass over `web/app/**` and `web/lib/format.ts`, plus removing the
resident-facing "Procesar ciclo" control now that `/api/tick` (shipped in
`specs/001-close-rtu-sync-loop`) drives the lifecycle automatically.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router (existing `web/` app — no new
project)

**Primary Dependencies**: None added. Plain CSS (`globals.css`) + inline styles, as today —
no CSS framework/component library introduced (project has none currently; adding one is a
bigger decision than this restyling pass warrants, see research.md).

**Storage**: N/A — no data model changes.

**Testing**: No automated UI test framework exists in this project. Validation is manual
(quickstart.md) against real breakpoints/contrast checks, consistent with how the resident
web app has been validated so far (`npm run build` for correctness, manual quickstart for
behavior).

**Target Platform**: Same Next.js web app, phone-first (per spec: residents mostly on
mobile), scaling up to desktop.

**Performance Goals**: No regression to current build/bundle size; system fonts only (no
web font loading cost).

**Constraints**: Dark theme is a starting point to formalize, not replace (spec
Assumptions); no new pages/functionality; must not touch `src/` (domain package) or any
API route — purely `web/app/**`, `web/lib/format.ts`, `web/app/globals.css`.

**Scale/Scope**: 3 screens (login, dashboard, invitation detail) + shared layout/globals.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. RTU as infrastructure adapter | Not touched — this feature is pure presentation layer | N/A / PASS |
| II. Ports & fakes before real adapters | Not touched — no new port/adapter surface | N/A / PASS |
| III. Dispatch/confirmation decoupled | Not touched | N/A / PASS |
| IV. Immutable audit trail | Not touched | N/A / PASS |
| V. Multi-tenant isolation via RLS | Not touched — no data-access changes | N/A / PASS |
| VI. Idempotent slot assignment | Not touched | N/A / PASS |
| Dev Workflow: "ships with passing npm test" | This feature has no `src/` changes, so `npm test` stays green; `npm run build` (web) is this feature's actual regression gate | PASS |

No violations — Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-resident-portal-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md         # Phase 1 output (manual validation guide)
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

No `data-model.md` or `contracts/` — this feature introduces no new entities and no new
API surface (spec's Key Entities section was omitted for the same reason).

### Source Code (repository root, `Remotion/web/`)

```text
web/
├── app/
│   ├── globals.css          # EDIT: type scale, spacing scale, semantic color tokens,
│   │                            breakpoints, component states (loading/error/empty)
│   ├── layout.tsx             # EDIT: minor — container now responsive, not fixed-width
│   ├── page.tsx                # EDIT: dashboard — responsive layout, loading/error/empty
│   │                             states, remove "Procesar ciclo" button
│   ├── actions.ts              # EDIT: remove procesarCicloAction (dead once its only
│   │                             caller — the button — is gone; /api/tick replaces it)
│   ├── login/page.tsx          # EDIT: loading state on submit, consistent styling
│   └── invitaciones/[id]/
│       └── page.tsx            # EDIT: consistent styling, responsive
└── lib/
    └── format.ts                # EDIT: statusBadge() sources colors from the new
                                     semantic tokens instead of ad-hoc hex pairs
```

**Structure Decision**: No structural change — every file touched already exists. This is a
styling/interaction pass, not a re-architecture.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
