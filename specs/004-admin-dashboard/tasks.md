---

description: "Task list for feature implementation"
---

# Tasks: Admin Dashboard (Condominium-Wide, Read-Only)

**Input**: Design documents from `/specs/004-admin-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md (all present)

**Tests**: No domain-package unit tests — this feature is entirely RLS + Server
Components (research.md: RLS is integration-level, not something the in-memory fakes
model). Validation is `quickstart.md`'s manual/RLS-boundary checks.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and validation of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Paths are relative to `Remotion/` for `supabase/`, and to `Remotion/web/` for the web
app — per `plan.md`'s Project Structure.

---

## Phase 1: Setup

- [ ] T001 Write migration `supabase/migrations/0007_admin_dashboard.sql` exactly per
      contracts/admin-rls.md: `perfiles.condominio_id`, `is_admin_for_condominio()`,
      and the 6 admin SELECT policies (`condominios`, `propiedades`, `dispositivos`,
      `residentes`, `invitaciones`, `mascotas`, `eventos` — 7 tables, per the
      data-model.md table)

**Checkpoint**: The RLS enforcement layer exists independently of any UI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No admin page can render without the auth seam and shell existing.

- [ ] T002 `web/lib/admin-session.ts`: `getCurrentAdmin()` — mirrors
      `getCurrentResident()`'s shape (session client, redirect to `/login` if
      unauthenticated), but checks `perfiles.rol === 'ADMIN'` and returns
      `{ ctx, condominioId }` instead of a resident/property (depends on T001)
- [ ] T003 `web/app/admin/layout.tsx` + new CSS in `web/app/globals.css`: sidebar nav
      shell (Resumen/Bitácora/Propiedades/Invitaciones links), calls
      `getCurrentAdmin()` as the route group's auth guard — desktop-first SaaS layout
      per research.md, new `.admin-shell`/`.admin-sidebar`/`.stat-card`/`.admin-table`
      classes built on `002`'s existing color/spacing tokens (depends on T002)

**Checkpoint**: The `/admin` shell exists and is reachable only by an actual admin;
every page below is "just" a data query + table inside it.

---

## Phase 3: User Story 1 - See every access event across the condominium (Priority: P1) 🎯 MVP

**Goal**: An admin can see the condo-wide audit trail, property-labeled.

**Independent Test**: Load `/admin/bitacora` and find an event belonging to a property
that isn't the admin's own (quickstart.md section 1, step 3).

- [ ] T004 [US1] `web/app/admin/bitacora/page.tsx`: query `eventos` (now readable
      condo-wide per T001's RLS) joined/labeled with the property each event traces
      back to; render as a table (depends on T003)
- [ ] T005 [US1] Validate quickstart.md section 1, step 3

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - See every household across the condominium (Priority: P1)

**Goal**: An admin sees every property's residents/family/employees with access status.

**Independent Test**: Find a family member or employee on a property that isn't the
admin's own, including their RUT if they're an employee (quickstart.md section 1, step 4).

- [ ] T006 [US2] `web/app/admin/propiedades/page.tsx`: list every property, and under
      each, its residents/family members/employees with `statusBadge`-style status —
      RUT shown here (admin-only visibility is intentional per spec User Story 2,
      scenario 2) (depends on T003)
- [ ] T007 [US2] Validate quickstart.md section 1, step 4

**Checkpoint**: US1 + US2 together — events and the people they're about are both visible.

---

## Phase 5: User Story 3 - See every visitor invitation across the condominium (Priority: P1)

**Goal**: An admin sees every property's invitations, property-labeled.

**Independent Test**: Find an invitation on a property that isn't the admin's own
(quickstart.md section 1, step 5).

- [ ] T008 [US3] `web/app/admin/invitaciones/page.tsx`: condo-wide invitations table,
      property-labeled, reusing `statusBadge` (depends on T003)
- [ ] T009 [US3] Validate quickstart.md section 1, step 5

**Checkpoint**: All three user stories independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T010 [P] `web/app/admin/page.tsx`: overview stat cards (property count, active
      family+employee count, active invitation count) — the landing page tying
      US1-US3 together, built last since it summarizes what they each already query
- [ ] T011 [P] `npm run build` (web) — clean, `/admin/*` routes registered, no
      regressions to existing routes
- [ ] T012 Validate quickstart.md section 2 (resident isolation unchanged, FR-005) and
      section 3 (RLS is the real boundary, not just hidden UI, FR-006) — the two
      checks that matter most given this feature's entire value is an enforcement
      guarantee, not just a nice screen

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: T002 needs T001 (checks `rol`/`condominio_id`); T003
  needs T002 (the layout calls it)
- **User Stories (Phase 3-5)**: All depend on Phase 2's shell existing. All three are
  independent of each other (different files, different queries) — could be built in
  parallel by different people once T003 lands.
- **Polish (Phase 6)**: T010 benefits from US1-US3's query patterns already existing
  (reuses their counting logic) but doesn't strictly require their page files to exist
  first; T011/T012 are last.

### Parallel Opportunities

- T004, T006, T008 (Phases 3-5) — once T003 is done, all three are different files
  with no shared state
- T010, T011 (Phase 6)

---

## Implementation Strategy

### MVP First (all three stories are P1 — ship together)

1. Phase 1 (Setup — the RLS layer) → Phase 2 (Foundational — the shell)
2. Phases 3-5 (US1, US2, US3) — independent, any order or in parallel
3. **STOP and VALIDATE**: quickstart.md sections 1-3 in full
4. Deploy

### Incremental Delivery

Given all three stories are P1 and small, there's little value in shipping them
separately — the natural unit here is "the whole read-only dashboard," not one table
at a time. Phase 6's overview page is the one piece that could reasonably ship
slightly after the others without anyone noticing its absence.

---

## Notes

- This feature's real risk is entirely in T001's RLS policies (data leaking across
  condominiums, or an admin seeing nothing at all due to a policy typo) — T012's
  boundary checks are not optional polish, they're the actual acceptance test for
  FR-006, the feature's core promise.
- Every task names its exact file path; none require additional context to start.
- Commit after each phase or logical group; stop at each checkpoint to validate before
  moving on.
