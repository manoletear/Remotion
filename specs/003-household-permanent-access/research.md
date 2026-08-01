# Research: Household Profile & Permanent Access

No `[NEEDS CLARIFICATION]` markers were left in the spec or Technical Context — both
open questions (does this grant real access; who edits it) were resolved with the user
before drafting. This document records the technical decisions behind `plan.md`.

## Decision: A parallel `permanent_access_sync.ts`, not a generalized `rtu_sync.ts`

**Decision**: Build a new orchestration module structurally mirroring
`src/orchestration/rtu_sync.ts` (`syncAddAccess`/`syncRemoveAccess`/`confirmOne`/
`confirmInFlight` → `syncAddPermanent`/`syncRemovePermanent`/`confirmOnePermanent`/
`confirmInFlightPermanent`), operating on `residentes` instead of `invitaciones`,
rather than refactoring the existing engine to be generic over both.

**Rationale**: `rtu_sync.ts` is the single most safety-critical file in the codebase —
it is what `001-close-rtu-sync-loop` just finished making reliable in production, and
it already has full test coverage for edge cases (timeout, retry-recovery, idempotent
cancellation). Permanent access is meaningfully different in shape: no expiration
(`EXPIRED` has no analogue), a different slot range, and different domain fields
(RUT/patente) with different sensitivity handling (FR-010). Forcing both into one
generic engine now — before the second use case has even shipped once — is exactly
the kind of premature abstraction the project's own conventions warn against ("Three
similar lines is better than a premature abstraction"). Once both engines have run in
production for a while and the actual shared surface is proven stable, merging them
is a safe follow-up; doing it now risks the one thing this system cannot afford to
regress.

**Alternatives considered**: Generalize `rtu_sync.ts` with a `SyncTarget` interface
parameterizing the entity type — rejected for the reason above. Have permanent access
call the *existing* invitation engine with a fake "invitation" shaped like a resident —
rejected as more confusing than two parallel, individually-readable modules.

## Decision: `jobs.invitation_id` becomes a polymorphic `entity_type` + `entity_id`

**Decision**: Migration `0006` renames `jobs.invitation_id` to `entity_id` (still
`uuid not null`, FK to `invitaciones` dropped) and adds `entity_type` (enum
`INVITATION | RESIDENT`) — mirroring `eventos`'s actual shape, which pairs `entidad`
(type) with `entidad_id`, not a bare uuid alone. (An earlier draft of this decision
cited "a bare uuid, no FK" as the eventos precedent and missed that eventos already
carries a type column too — corrected here before writing any code against it.)
Existing `ACTIVATION`/`EXPIRATION` rows are invitation-only by construction and
backfill `entity_type = 'INVITATION'` via the column default; new resident-targeted
`RETRY` jobs set `entity_type = 'RESIDENT'`. `tick()` needs this to route a due
`RETRY` job to the invitation retry path or the new permanent-access retry path —
without a type column, a `RETRY` job's `entity_id` alone is ambiguous between the two
tables.

**Rationale**: Without this, a failed permanent-access sync has no way to schedule an
automatic re-drive the way `failSync` already does for invitations (`rtu_sync.ts`'s
`RETRY` job scheduling) — it would sit in `ERROR` forever with no automatic recovery,
which the spec doesn't call for and which would be a worse reliability story than
invitations already have. The `entidad_id` precedent in `eventos` shows this is
already the project's accepted pattern for "one job/event table, multiple possible
entity types" — not a new kind of risk being introduced.

**Alternatives considered**: A second `jobs`-like table just for resident retries —
rejected as needless duplication of a mechanism (`due()`/`complete()` cursor) that
already works and is already tested. Keep the FK and give residents their own
`resident_jobs` table with parallel scheduler logic — same objection, more surface
than the actual problem requires.

## Decision: Chilean RUT validation — check digit (módulo 11), not just format

**Decision**: `shared/validators.ts` gains a `rut()` validator that (1) strips
formatting (dots, dash), (2) validates the body is numeric, (3) computes the expected
check digit via the standard módulo 11 algorithm and compares it against the supplied
digit (`0-9` or `K`/`k`), returning a normalized `XXXXXXXX-X` form on success.

**Rationale**: FR-007/SC-004 explicitly require validating the check digit, not just
"looks like a RUT" — a malformed RUT recorded for a household employee is exactly the
kind of bad data this feature exists to prevent. The módulo 11 algorithm is a stable,
fully-specified public standard (Chile's own SII uses it), not something that needs
an external service or library.

**Alternatives considered**: A regex-only format check — rejected, doesn't satisfy
FR-007's explicit check-digit requirement. An npm RUT-validation package — rejected,
the algorithm is ~15 lines and pulling a dependency for it doesn't match the project's
"no dependency for something this small" pattern (see `twilio_signature.ts`'s
from `001`, which made the same call for HMAC).

## Decision: Pet photo upload via a thin server-side proxy route, not direct client→Storage

**Decision**: `web/app/api/pets/photo/route.ts` accepts a multipart upload from the
resident's browser, validates size/format server-side (FR-011), and writes to the
`mascotas-fotos` Supabase Storage bucket under the service-role client at a
`{propiedad_id}/{pet_id}` path. The client never talks to Supabase Storage directly.

**Rationale**: Keeps the same trust boundary the rest of the app already uses — every
other write goes through a server action or route under `getCurrentResident()`'s
authorization check, not a client SDK call with its own credential. It also lets
FR-011's size/format validation happen in one place with clear, specific error
messages, rather than duplicating that logic client-side and server-side (Supabase
Storage bucket-level size limits produce a generic error, not the specific one FR-011
calls for).

**Alternatives considered**: Signed upload URLs (client uploads directly to Storage
with a short-lived signed URL) — a reasonable pattern in general, but adds a
round-trip (get signed URL, then upload) for no benefit at this scale (pet photos,
a handful of properties) and moves validation to the client, which is easier to bypass
than a server-side check.

## Decision: Slot range enforcement — reuse `RTU5024.RESIDENT_SLOT_START`/`INVITATION_SLOT_START`

**Decision**: The permanent-access `assignSlot` scans
`RTU5024.RESIDENT_SLOT_START..RTU5024.INVITATION_SLOT_START - 1` (i.e. 1-99), using
`residentes`' own `occupiedSlots`-equivalent query (new: `ResidentRepository.
occupiedSlots(deviceId)`, mirroring `InvitationRepository.occupiedSlots`) — not a
shared "all occupied slots across both tables" query, since the two ranges are
already disjoint by construction (existing constants, unchanged) and never need to be
compared against each other.

**Rationale**: `shared/constants.ts` already defines both boundaries
(`RESIDENT_SLOT_START = 1`, `INVITATION_SLOT_START = 100`) — this feature is the first
to actually *use* the resident half of that range, but the range itself needs no
redesign. Confirms `Edge Cases`' note that the 99-slot ceiling is genuinely shared
condominium-wide (one device, one phonebook) — `occupiedSlots` must query by
`dispositivo_id`, not `propiedad_id`, exactly like the invitation version already does.
