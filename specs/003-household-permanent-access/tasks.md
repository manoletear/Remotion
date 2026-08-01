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

- [X] T001 Migration `supabase/migrations/0006_household_permanent_access.sql` written
      (not yet applied to the real Supabase project — see Next Actions in
      `Projects/CondoGATE/CLAUDE.md`). **Landed together with T002** (same file, one
      cohesive schema change). **Corrected mid-writing**: the original plan cited
      `eventos.entidad_id` as "a bare uuid, no type column" precedent for
      `jobs.entity_id` — wrong, `eventos` actually pairs `entidad` (type) + `entidad_id`.
      Added `jobs.entity_type` (enum `INVITATION | RESIDENT`) to actually match that
      precedent; without it `tick()` couldn't route a due `RETRY` job to the right
      engine. Also added `residentes.removal_requested` (mirrors
      `invitaciones.cancelled`) — needed so a retried ERROR resident knows whether to
      re-drive toward `ACTIVE` or `REMOVED`, the same ambiguity invitations resolve
      with `cancelled`.
- [X] T002 [P] `mascotas-fotos` bucket + RLS storage policies included in migration
      0006 (see T001 note).
- [X] T003 [P] `normalizeRut()` in `src/shared/validators.ts`, wired into `Validator`
      as `.rut()`. 4 unit tests in `src/shared/validators.test.ts` — computed the K-digit
      test case programmatically rather than trusting a recalled "well-known" example
      (one such recalled example turned out wrong when checked).

**Checkpoint**: Schema and the one pure-function validator exist independently of
everything else.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story below can dispatch a real RTU command until this phase's
sync engine exists.

- [X] T004 `src/domain/resident/index.ts` extended with all the new fields plus
      `removal_requested`; `assertResidentTransition`/`canTransitionResident` added
      (5-state machine, no CREATED/EXPIRED — see data-model.md).
- [X] T005 `src/mcp/supabase/port.ts`: `ResidentPatch` extended; `ResidentRepository`
      gained `occupiedSlots`, `findByPhone` (needed for FR-008, not originally listed
      here but required by contracts/household-skills.md), `listByStatus`; new
      `PetRepository`/`Pet`/`NewPet` and `DataStore.pets`.
- [X] T006 [P] `in_memory.ts` implements all of T005.
- [X] T007 [P] `supabase_store.ts` implements all of T005 (real backend — untestable
      against the live DB until migration 0006 is applied, per T001's note).
- [X] T008 `src/orchestration/permanent_access_sync.ts` written — structurally mirrors
      `rtu_sync.ts` throughout (transition/assignSlot/resolveDevice/timedOut/
      syncAdd/syncRemove/confirmOne/confirmInFlight/closeOut/failSync), targeting
      `RTU5024.RESIDENT_SLOT_START..INVITATION_SLOT_START-1` (1-99) and scheduling
      `RETRY` jobs with `entityType: "RESIDENT"`.
- [X] T009 `tick()` in `invitation_lifecycle.ts` now calls `confirmInFlightPermanent`
      alongside `confirmInFlight`, and routes a due `RETRY` job to `retry()` or the new
      `retryPermanent()` based on `job.entityType` (not in the original task wording —
      needed once `entity_type` was added per T001's correction).
      **This required a broader change than planned**: `ScheduledJob`/`SchedulerPort`
      themselves were generalized (`invitationId` → `entityType` + `entityId`) across
      `src/mcp/scheduler/{port,in_memory,supabase_scheduler}.ts` and every
      `ctx.scheduler.schedule(...)` call site (`create_invitation.ts`,
      `update_invitation.ts`, `rtu_sync.ts`) — the scheduler port was invitation-specific
      before this feature and had to become polymorphic to support resident RETRY jobs
      at all.

**Checkpoint**: A real, tested permanent-access sync engine exists; every user story
below is now "just" a skill + UI wrapper around it.

---

## Phase 3: User Story 1 - Add a family member who lives in the unit (Priority: P1) 🎯 MVP

**Goal**: A resident can add a family member and see their access confirmed.

**Independent Test**: Add a family member; confirm the device recognizes their number,
with no expiration (quickstart.md section 2).

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] `src/permanent_access.test.ts`: happy path (confirms slot 1, not
      the invitation range), failed add, ack timeout, slot reuse after removal,
      concurrent distinct slots, permanent/invitation ranges never collide, no-op
      removal of an unsynced resident. 7 tests, all passing.

### Implementation for User Story 1

- [X] T011 [US1] `src/skills/household/add_family_member.ts` — matches contract;
      `findByPhone` added to the port (T005) specifically to support FR-008 here.
- [X] T012 [US1] `web/app/perfil/actions.ts`: `agregarFamiliarAction` (and, ahead of
      schedule, `agregarEmpleadoAction`/`removerMiembroAction`/`agregarMascotaAction`/
      `removerMascotaAction` too — one actions file for the whole page, matching
      how `web/app/actions.ts` already covers all of the dashboard's actions).
- [X] T013 [US1] `web/app/perfil/page.tsx` + `perfil-forms.tsx` (client components,
      `useActionState`): family list with `statusBadge` tones (confirmed
      `ResidentStatus`'s string values are identical to the `InvitationStatus` subset
      `statusBadge` already switches on, so it needed zero changes to support residents).
- [~] T014 [US1] **Build-verified only.** `npm run build` (web) registers `/perfil`
      cleanly; a live pass needs migration 0006 applied to the real Supabase project
      first (not done yet — see CLAUDE.md Next Actions) and then a human trying it.

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Add a domestic employee (Priority: P1)

**Goal**: Same as US1, plus RUT + plate on record.

**Independent Test**: Add an employee with a RUT (valid and invalid cases); confirm
the same access flow, and that the RUT never leaks into audit/notifications
(quickstart.md section 3).

- [X] T015 [US2] `src/skills/household/add_employee.ts` — matches contract.
- [X] T016 [US2] `AddEmpleadoForm` in `perfil-forms.tsx` + employee table in
      `page.tsx` (RUT, patente columns).
- [~] T017 [US2] **Partially verified.** Confirmed by code inspection (not a live
      grep against a real DB yet): `permanent_access_sync.ts`'s `auditEvent` payloads
      only ever include `operation`/`slot`/`deviceId`/`error`/`attempts`/`willRetry` —
      `resident.rut` is never referenced anywhere in that file. Live confirmation
      (SC-005) still needs migration 0006 applied + a real employee added.

**Checkpoint**: US1 + US2 together — the core permanent-access capability is complete.

---

## Phase 5: User Story 3 - Add a pet, informationally (Priority: P2)

**Goal**: A resident can add a pet with a photo; zero device interaction.

**Independent Test**: Add a pet (valid and oversized/bad-format photo cases); confirm
no SMS gateway call is ever made for it (quickstart.md section 4).

- [X] T018 [P] [US3] `src/skills/pets/add_pet.ts`/`remove_pet.ts` — `removePet`
      returns the deleted row (not just void) so the caller can clean up its
      `foto_path` in storage, per contracts/pet-skills.md.
- [X] T019 [US3] `web/app/api/pets/photo/route.ts`: 5MB limit, JPG/PNG/WEBP allow-list,
      specific rejection messages, uploads via service-role client to
      `{propiedad_id}/{pet_id}.{ext}`.
- [X] T020 [US3] `AddMascotaForm` + `PetPhotoUpload` (client, `fetch`-based — a plain
      server action can't easily give per-upload progress/error feedback for a
      multipart file the way `useActionState` does for text fields) + pet gallery in
      `page.tsx`, with signed URLs (5 min TTL) generated server-side since the bucket
      is private.
- [~] T021 [US3] **Build-verified only** — same migration/live-testing caveat as T014.
      Confirmed by code inspection that `add_pet.ts`/`remove_pet.ts` never reference
      `ctx.sms` or `ctx.scheduler` at all.

**Checkpoint**: All three "add" stories independently functional.

---

## Phase 6: User Story 4 - Remove a family member's or employee's access (Priority: P1)

**Goal**: A resident can revoke permanent access; the slot is freed for reuse.

**Independent Test**: Remove a confirmed family member/employee; confirm the device
revokes them and a newly-added member can reuse the freed slot (quickstart.md
sections 5-6).

- [X] T022 [US4] `src/skills/household/remove_household_member.ts` — matches contract;
      idempotent on REMOVED/REMOVING; rejects `tipo === 'RESIDENT'`.
- [X] T023 [US4] `removerMiembroAction` + `.btn-circle small danger` "Quitar" buttons
      on both the family and employee tables in `page.tsx`.
- [~] T024 [US4] **Unit-tested, not live-tested.** `permanent_access.test.ts`'s
      "removal reaches REMOVED and frees the slot for reuse" test covers this exact
      scenario against the fake gateway. Live pass needs migration 0006 applied.
- [ ] T025 [US4] **Not yet validated even in tests** — filling all 99 slots to check
      the exhaustion message is expensive to set up and wasn't done this pass. The
      code path exists (`assignSlot` throws `RtuSyncError("No free permanent RTU slot
      available")`, surfaced by `agregarFamiliarAction`'s catch block as
      "No se pudo agregar: ..."), but is unverified. Flagged, not silently skipped.

**Checkpoint**: All four user stories independently verifiable; a resident can fully
manage their household's permanent access end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T026 [P] `npm test` — 34/34 passing (16 pre-existing + 4 RUT + 7 sync-engine +
      7 household/pet-skill tests).
- [X] T027 [P] `npm run build` (web) — clean; `/perfil` and `/api/pets/photo`
      registered; `001`/`002`'s routes unaffected.
- [ ] T028 **Not done.** Requires migration 0006 applied to the real Supabase project
      (and the `mascotas-fotos` bucket existing there) first — tracked in
      `Projects/CondoGATE/CLAUDE.md` Next Actions. T025's slot-exhaustion check is
      also still outstanding regardless of live DB access (see T025).

### Discovered during implementation (not in the original task list)

- **Scheduler port had to become polymorphic** (T009's note) — a materially bigger
  change than "add one field," since every existing call site needed updating too.
  Verified nothing broke: all pre-existing invitation tests still pass unchanged.
- **`eventos`/`jobs` precedent correction** (T001's note) — caught and fixed before
  writing code against the wrong assumption, not after.
- **`residentes` RLS gap** — like `eventos` in `001`, `residentes` had no INSERT policy
  and an UPDATE policy scoped to `id = current_residente_id()` only (a resident could
  update only their own row). Neither would have supported this feature at all. Fixed
  in migration 0006 (`residentes_insert_own`/`residentes_update_own`/
  `residentes_delete_own`, all scoped to `propiedad_id = current_propiedad_id()`,
  replacing the too-narrow update policy).

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
