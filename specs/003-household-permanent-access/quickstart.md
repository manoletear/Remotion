# Quickstart: Validating Household Profile & Permanent Access

Prerequisites: migration `0006` applied; `mascotas-fotos` Storage bucket created with
its RLS policies; logged in as a seeded resident (per `docs/ONBOARDING.md` /
`scripts/seed.ts`).

## 1. Domain-level tests first (prerequisite, mirrors 001's own discipline)

```bash
npm test
```

Expect the new permanent-access engine's tests (happy path, failed add, ack timeout,
retry-recovers, slot exhaustion) to pass alongside the existing 16.

## 2. Add a family member (US1)

1. Go to `/perfil`, "Nueva familiar": name + phone.
2. Confirm it appears with `PENDING_SYNC` (or `ACTIVE` immediately against the fake
   gateway in local dev).
3. Call `/api/tick` (or wait for the cron, once scheduled per `001`'s follow-up) —
   confirm it resolves to `ACTIVE`.

## 3. Add an employee with RUT + patente (US2)

1. "Nuevo empleado": name, phone, RUT (try an invalid check digit first — expect a
   clear rejection before anything is saved), then a valid RUT + a plate.
2. Confirm the same activation flow as step 2.
3. Confirm the RUT never appears in `/perfil`'s own bitácora view or in any
   notification — only in the employee's own row.

## 4. Add a pet (US3)

1. "Nueva mascota": name + photo (try an oversized/unsupported file first — expect
   the specific FR-011 error, not a generic failure).
2. Confirm the pet appears with its photo, and that `npm run dev`'s server logs show
   no SMS gateway call was made for it.

## 5. Remove a family member / employee (US4)

1. Remove a confirmed family member or employee.
2. Confirm it moves to `REMOVING` then, after `/api/tick`, `REMOVED`.
3. Add a new family member — confirm it reuses the now-freed slot (same idempotent
   slot-reuse guarantee invitations already have).

## 6. Slot exhaustion (edge case, FR-009/SC-006)

With a test device, fill all 99 permanent slots (family/employees, possibly combined
with the seed's own resident), then try to add one more — confirm a clear "no slots
available" message, not a hang or a silent failure.

## Out of scope for this quickstart

Real-hardware validation against a physical RTU5024 remains a separate, already-tracked
gap (see `specs/001-close-rtu-sync-loop`'s Assumptions) — this quickstart validates
against the fake gateway / Twilio-real-but-no-hardware the same way `001`'s did.
