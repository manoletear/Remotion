---

description: "Task list for feature implementation"
---

# Tasks: Household Profile & Permanent Access

**Input**: Design documents from `/specs/003-household-permanent-access/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md (all present)

**Tests**: Explicitly in scope — FR-007/SC-004 (RUT check-digit) and the permanent-access
engine's reliability guarantees (mirroring `001`'s own test discipline) both need real
coverage, not just manual validation.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and validation of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3/US4)

## Path Conventions

Paths are relative to `Remotion/` (package root) for `src/`/`supabase/`, and to
`Remotion/web/` for the web app — per `plan.md`'s Project Structure.

---

## Phase 1: Setup

- [ ] T001 Write migration `supabase/migrations/0006_household_permanent_access.sql`:
      `resident_tipo`/`resident_status` enums, new `residentes` columns (`tipo`, `rut`,
      `patente`, `estado`, `dispositivo_id`, `rtu_slot`, `sent_at`, `sync_attempts`,
      `last_error`), `residentes_device_slot_unique` index, `mascotas` table + its RLS
      policies, `jobs.invitation_id` → `entity_id` rename with FK dropped (data-model.md)
- [ ] T002 [P] Create the `mascotas-fotos` Supabase Storage bucket and its
      `{propiedad_id}/...`-scoped RLS policies (data-model.md "Storage" section)
- [ ] T003 [P] Implement `rut()` in `src/shared/validators.ts` (módulo 11 check digit,
      normalizes to `XXXXXXXX-X`) with unit tests covering valid/invalid/K-digit cases
      (research.md, FR-007)

**Checkpoint**: Schema and the one pure-function validator exist independently of
everything else.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story below can dispatch a real RTU command until this phase's
sync engine exists.

- [ ] T004 Extend `src/domain/resident/index.ts`: `Resident` gains `tipo`, `rut`,
      `patente`, `estado`, `dispositivo_id`, `rtu_slot`, `sent_at`, `sync_attempts`,
      `last_error`; add `ResidentStatus` transitions (`assertTransition`/`canTransition`
      equivalent to `domain/invitation/index.ts`'s, per data-model.md's state diagram)
      (depends on T001 for the enum shape to mirror)
- [ ] T005 Extend `src/mcp/supabase/port.ts`: `ResidentPatch` covers the new sync
      fields; `ResidentRepository` gains `occupiedSlots(deviceId)`; new
      `PetRepository` (create/get/listByProperty/delete) and its entry in `DataStore`
- [ ] T006 [P] Implement T005's port additions in `src/mcp/supabase/in_memory.ts`
      (needed first — tests run against this)
- [ ] T007 [P] Implement T005's port additions in `src/mcp/supabase/supabase_store.ts`
      (depends on T001's real schema existing)
- [ ] T008 New `src/orchestration/permanent_access_sync.ts`: `syncAddPermanent`,
      `syncRemovePermanent`, `confirmOnePermanent`, `confirmInFlightPermanent` —
      structurally mirrors `rtu_sync.ts` exactly (research.md's "parallel engine"
      decision), targeting `residentes`/slots 1-99 instead of `invitaciones`/100-200
      (depends on T004, T006)
- [ ] T009 Edit `src/orchestration/invitation_lifecycle.ts`: `tick()` also calls
      `confirmInFlightPermanent(ctx, now)` alongside the existing
      `confirmInFlight(ctx, now)` (depends on T008)

**Checkpoint**: A real, tested permanent-access sync engine exists; every user story
below is now "just" a skill + UI wrapper around it.

---

## Phase 3: User Story 1 - Add a family member who lives in the unit (Priority: P1) 🎯 MVP

**Goal**: A resident can add a family member and see their access confirmed.

**Independent Test**: Add a family member; confirm the device recognizes their number,
with no expiration (quickstart.md section 2).

### Tests for User Story 1 ⚠️

- [ ] T010 [P] [US1] `src/permanent_access.test.ts` (new file, mirrors
      `lifecycle.test.ts`'s structure): happy path add→confirm, failed add, ack
      timeout, retry-recovers, slot reuse after removal — against
      `permanent_access_sync.ts` directly (depends on T008)

### Implementation for User Story 1

- [ ] T011 [US1] `src/skills/household/add_family_member.ts` per
      contracts/household-skills.md: validation, FR-008 duplicate-phone check, insert
      `tipo='FAMILIAR'`, call `syncAddPermanent` (depends on T008)
- [ ] T012 [US1] `web/app/perfil/actions.ts`: `agregarFamiliarAction` (busy/error
      pattern from `002`'s `SubmitButton`/`useActionState` — reuse, don't reinvent)
- [ ] T013 [US1] `web/app/perfil/page.tsx`: "Nueva familiar" form + family list with
      status badges (reuse `002`'s `statusBadge`-style tone tokens, extended for
      `ResidentStatus`)
- [ ] T014 [US1] Validate quickstart.md section 2

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Add a domestic employee (Priority: P1)

**Goal**: Same as US1, plus RUT + plate on record.

**Independent Test**: Add an employee with a RUT (valid and invalid cases); confirm
the same access flow, and that the RUT never leaks into audit/notifications
(quickstart.md section 3).

- [ ] T015 [US2] `src/skills/household/add_employee.ts` per
      contracts/household-skills.md: same as `add_family_member` plus `rut()`
      validation (T003) before saving anything; `patente` optional free text (depends
      on T003, T008)
- [ ] T016 [US2] Extend `web/app/perfil/actions.ts`/`page.tsx`: "Nuevo empleado" form
      (RUT + plate fields) and employee list (depends on T011-T013's patterns)
- [ ] T017 [US2] Validate quickstart.md section 3, including grepping/inspecting
      audit-event payloads to confirm RUT is absent (FR-010, SC-005)

**Checkpoint**: US1 + US2 together — the core permanent-access capability is complete.

---

## Phase 5: User Story 3 - Add a pet, informationally (Priority: P2)

**Goal**: A resident can add a pet with a photo; zero device interaction.

**Independent Test**: Add a pet (valid and oversized/bad-format photo cases); confirm
no SMS gateway call is ever made for it (quickstart.md section 4).

- [ ] T018 [P] [US3] `src/skills/pets/add_pet.ts` and `remove_pet.ts` per
      contracts/pet-skills.md (depends on T005-T007 for `PetRepository`)
- [ ] T019 [US3] `web/app/api/pets/photo/route.ts`: multipart upload, FR-011
      size/format validation with specific error messages, writes to
      `mascotas-fotos` via service-role client (depends on T002)
- [ ] T020 [US3] Extend `web/app/perfil/page.tsx`: "Nueva mascota" form (name + photo)
      and a pet gallery (depends on T018, T019)
- [ ] T021 [US3] Validate quickstart.md section 4

**Checkpoint**: All three "add" stories independently functional.

---

## Phase 6: User Story 4 - Remove a family member's or employee's access (Priority: P1)

**Goal**: A resident can revoke permanent access; the slot is freed for reuse.

**Independent Test**: Remove a confirmed family member/employee; confirm the device
revokes them and a newly-added member can reuse the freed slot (quickstart.md
sections 5-6).

- [ ] T022 [US4] `src/skills/household/remove_household_member.ts` per
      contracts/household-skills.md: mirrors `cancelInvitation`'s close-out-or-dispatch
      shape; rejects removing a `tipo='RESIDENT'` row (depends on T008)
- [ ] T023 [US4] Extend `web/app/perfil/actions.ts`/`page.tsx`: remove buttons on
      family/employee rows, reusing `002`'s `SubmitButton`/`.btn-circle danger` pattern
      (depends on T012, T022)
- [ ] T024 [US4] Validate quickstart.md section 5 (revoke + slot reuse)
- [ ] T025 [US4] Validate quickstart.md section 6 (slot exhaustion → clear message,
      FR-009/SC-006)

**Checkpoint**: All four user stories independently verifiable; a resident can fully
manage their household's permanent access end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T026 [P] `npm test` — full domain suite (existing 16 + this feature's new cases)
      green
- [ ] T027 [P] `npm run build` (web) — clean, `/perfil` and `/api/pets/photo`
      registered correctly, no regressions to `001`/`002`'s routes
- [ ] T028 Re-run all of quickstart.md end-to-end before calling the feature done
      (SC-001 through SC-006 all satisfied)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001/T002/T003 are independent of each other — parallelize
- **Foundational (Phase 2)**: T004 needs T001's enum shape; T006/T007 need T005;
  T008 needs T004+T006; T009 needs T008 — mostly sequential within the phase
- **User Stories (Phase 3+)**: All depend on Phase 2's sync engine existing. US1 and
  US2 share the same web page/actions file (`web/app/perfil/*`) — do US1 first, US2
  extends it, not a parallel edit of the same file. US3 (pets) touches entirely
  different files and is fully independent — could run in parallel with US1/US2 by a
  second person. US4 (remove) depends on US1/US2's skills existing (there must be
  something to remove) but is otherwise independent of US3.
- **Polish (Phase 7)**: After all desired stories are complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P1)**: Depends on Phase 2 + T003 (rut validator). Shares `web/app/perfil/*`
  with US1 — sequence after it, don't parallelize the same files.
- **US3 (P2)**: Depends on Phase 2 (for `PetRepository` plumbing only — the pet skills
  themselves don't touch `permanent_access_sync.ts` at all). Fully independent of
  US1/US2/US4's files.
- **US4 (P1)**: Depends on Phase 2 + US1/US2 having shipped something to remove.

### Parallel Opportunities

- T001, T002, T003 (Phase 1)
- T006, T007 (Phase 2) — same interface, different backend files
- US3's tasks (T018-T021) can run in parallel with US1/US2's, once Phase 2 is done —
  no shared files
- T026, T027 (Phase 7)

---

## Parallel Example: Phase 1 (Setup)

```bash
Task: "Write migration 0006 (residentes columns, mascotas table, jobs rename)"
Task: "Create mascotas-fotos Storage bucket + RLS policies"
Task: "Implement rut() validator with tests"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 + 4 together — all P1)

1. Phase 1 (Setup) → Phase 2 (Foundational — the sync engine, the real unlock)
2. Phase 3 (US1) → Phase 4 (US2, extends the same page) → Phase 6 (US4, revoke)
3. **STOP and VALIDATE**: quickstart.md sections 2, 3, 5, 6
4. Deploy — residents can now grant *and revoke* real permanent access themselves

### Incremental Delivery

1. Setup + Foundational → the sync engine exists and is tested
2. US1 + US2 + US4 → the MVP: grant and revoke permanent access → Deploy
3. US3 (pets) → household record completeness, zero access-control risk → Deploy
   any time, including in parallel with the above
4. Polish → full build + full quickstart pass

---

## Notes

- This feature's riskiest piece (the sync engine) is deliberately isolated
  (research.md) from `001`'s proven invitation engine — Phase 2 is where that risk
  lives, and it ships with its own full test suite before any user-facing skill is
  built on top of it.
- Every task names its exact file path; none require additional context to start.
- Commit after each phase or logical group; stop at each checkpoint to validate before
  moving on.
