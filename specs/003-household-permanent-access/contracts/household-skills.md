# Contract: Household access skills

Skill-level contracts (this project's convention — see `ARCHITECTURE.md`'s Skills
layer — not HTTP endpoints; the web app's `web/app/perfil/actions.ts` server actions
are thin wrappers over these).

## `addFamilyMember(ctx, input): Promise<Resident>`

**Input**: `{ propiedad_id, nombre, telefono }`

**Behavior**:
1. Validate `nombre` non-empty, `telefono` E.164 (reuse `Validator`, same as
   `createInvitation`).
2. Reject if `telefono` already belongs to any resident (any `tipo`) or invitation
   record for the same property (FR-008 — no duplicate device entries).
3. Insert a `residentes` row with `tipo = 'FAMILIAR'`, `estado = 'PENDING_SYNC'`.
4. Call `syncAddPermanent(ctx, resident.id)` (dispatches immediately — no scheduled
   job, unlike invitation activation).
5. Return the resident row (its `estado` reflects `PENDING_SYNC` or `ERROR`
   immediately; `ACTIVE` only after a later confirm — same non-blocking shape as
   invitation creation).

**Errors**: `ValidationError` (bad input), a duplicate-phone error (FR-008),
`RtuSyncError` surfaced as a no-free-slot message (FR-009) if `assignSlot` finds
nothing available.

## `addEmployee(ctx, input): Promise<Resident>`

**Input**: `{ propiedad_id, nombre, telefono, rut, patente? }`

Same behavior as `addFamilyMember`, plus:
- `rut` validated via `shared/validators.ts`'s `rut()` (FR-007) before anything is
  saved.
- `tipo = 'EMPLEADO'`.
- `patente` is optional, free-text, no validation beyond non-empty-if-present — it is
  informational only (spec User Story 2, acceptance scenario 2).

## `removeHouseholdMember(ctx, residentId): Promise<Resident>`

**Behavior**: Mirrors `cancelInvitation`'s shape — if never synced (`rtu_slot` null),
close out directly to `REMOVED`; otherwise dispatch a removal via
`syncRemovePermanent` and let confirmation (or the ack-timeout retry path) resolve it
to `REMOVED`. Only `FAMILIAR`/`EMPLEADO` rows are removable this way — attempting to
remove a `tipo = 'RESIDENT'` row through this skill is rejected (that row is the
account owner; removing it is an account-deletion concern out of this feature's
scope).

**Errors**: `NotFoundError`, a rejection if `tipo === 'RESIDENT'`.

## Confirmation sweep

`confirmInFlightPermanent(ctx, now)` — called from `tick()` alongside the existing
`confirmInFlight(ctx, now)` for invitations. Same non-blocking, per-row-isolated sweep
shape (`rtu_sync.ts`'s `confirmInFlight` already isolates one row's failure from the
rest of the batch; the permanent-access version does the same).
