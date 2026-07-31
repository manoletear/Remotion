# Feature Specification: Household Profile & Permanent Access

**Feature Branch**: `003-household-permanent-access`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Perfil de familia del residente: cada residente puede
gestionar un perfil con (1) familiares que viven en la unidad — nombre y teléfono, quedan
como accesos permanentes reales al portón (slot RTU 1-99, igual que el residente
principal); (2) empleados domésticos — nombre, RUT, teléfono, patente de vehículo,
también con acceso permanente real al portón; (3) mascotas — nombre y foto, esto es solo
informativo, no otorga acceso. El residente mismo edita todo. El RUT es dato sensible y
debe tratarse como tal. Hoy el sistema NO tiene lógica para sincronizar accesos
permanentes con el RTU (solo invitaciones temporales se sincronizan) — este feature la
necesita por primera vez."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a family member who lives in the unit (Priority: P1)

A resident adds a family member (name and phone number) who lives with them. That
person's phone becomes permanently recognized at the gate immediately — the same way the
resident's own number already is — with no expiration window, unlike a visitor
invitation.

**Why this priority**: This is the core, unprecedented capability this feature adds — a
resident-facing way to grant *permanent* access, which today only exists via an
admin-run seed script. Without it, the rest of the feature (employees, pets) has nothing
to stand on.

**Independent Test**: Add a family member with a valid name and phone; confirm the
gate's phonebook is updated to recognize that number, and it remains recognized
indefinitely (no automatic expiration).

**Acceptance Scenarios**:

1. **Given** a resident with at least one free permanent slot on their condominium's
   device, **When** they add a family member with a valid name and phone, **Then** the
   system dispatches an authorization command to the device and, once confirmed, the
   family member's number is permanently recognized.
2. **Given** a resident whose condominium's device has no free permanent slots
   remaining, **When** they try to add a family member, **Then** the system clearly
   explains that no slots are available rather than silently failing or queuing forever.
3. **Given** a family member was added successfully, **When** the resident views their
   household profile, **Then** that family member appears with a status reflecting
   whether their access is confirmed, still syncing, or failed.

---

### User Story 2 - Add a domestic employee, with the extra records their role requires (Priority: P1)

A resident adds a domestic employee: name, phone (for the same permanent gate access as
a family member), plus their RUT and vehicle plate — records that don't affect gate
access but that the household needs on file for this kind of relationship.

**Why this priority**: Equal priority to User Story 1 — mechanically it is the same
permanent-access capability, just for a different relationship with two additional
fields. Shipping one without the other leaves the feature half-done.

**Independent Test**: Add an employee with name, phone, RUT, and plate; confirm the same
permanent gate recognition as User Story 1, and confirm the RUT is stored but never
appears anywhere it doesn't need to (see FR-010).

**Acceptance Scenarios**:

1. **Given** a resident adds an employee with a valid RUT, **When** the record is
   saved, **Then** the RUT is validated against the standard Chilean RUT format
   (including its check digit) before being accepted.
2. **Given** an employee record with a vehicle plate, **When** the resident views the
   household profile, **Then** the plate is shown as informational household-staff data
   — it does not, by itself, grant any vehicle-related access (no ALPR in this system).
3. **Given** an employee's gate access, **When** it is granted or later revoked (User
   Story 4), **Then** it follows the exact same permanent-access mechanism as a family
   member's — the RUT/plate fields are pure metadata layered on top.

---

### User Story 3 - Add a pet, informationally (Priority: P2)

A resident adds a pet's name and a photo to the household profile. This is purely
informational — it never touches the gate device and grants no access of any kind.

**Why this priority**: P2 — genuinely useful for the household record the feature is
building, but it has zero access-control stakes, unlike User Stories 1-2, and the
feature delivers its core value without it.

**Independent Test**: Add a pet with a name and photo; confirm it appears on the
household profile and that no device command of any kind is ever dispatched for it.

**Acceptance Scenarios**:

1. **Given** a resident adds a pet with a name and a photo, **When** the record is
   saved, **Then** it appears on the household profile with its photo, and no RTU sync
   of any kind is triggered.
2. **Given** a photo upload that is too large or an unsupported format, **When** the
   resident submits it, **Then** they see a clear, specific error (not a generic
   failure) explaining the limit.

---

### User Story 4 - Remove a family member's or employee's access (Priority: P1)

A resident removes a family member or employee from the household profile — because they
moved out, or the employment ended. Their number stops being recognized at the gate, and
the permanent slot they held becomes available for someone else.

**Why this priority**: P1, equal to User Stories 1-2 — granting permanent access without
a working revoke path is a security gap, not a smaller version of the feature. A
household profile that can only grow is not acceptable for something that controls
physical access.

**Independent Test**: Remove a previously-added family member or employee; confirm the
device's authorization for their number is revoked and their slot is freed for reuse.

**Acceptance Scenarios**:

1. **Given** a family member or employee with confirmed permanent access, **When** the
   resident removes them, **Then** the system dispatches a removal command to the device
   and, once confirmed, their number is no longer recognized.
2. **Given** a removal is in progress (dispatched but not yet confirmed), **When** the
   resident views the household profile, **Then** they see that the removal is still in
   progress, not a final "removed" state, mirroring how invitation removal is already
   shown.
3. **Given** a slot was freed by a removal, **When** a new family member or employee is
   added afterward, **Then** they can be assigned that freed slot.

---

### Edge Cases

- What happens when two household members are added around the same time and both need
  a slot? Slot assignment must remain deterministic and collision-free, the same
  guarantee invitations already have (Constitution VI).
- What happens if a family member's or employee's *phone number* needs to change (not a
  full remove-and-readd)? At minimum, the resident must be able to remove the old entry
  and add a corrected one — the feature isn't required to support in-place phone editing
  of a *device-synced* record on day one, but it must not corrupt the old sync in the
  attempt (see Assumptions).
- What happens if the same phone number is added twice (as two family members, or as
  both a family member and an employee)? The system must reject the duplicate rather
  than silently creating two device entries for one number.
- What happens if a resident tries to add an invalid RUT (bad check digit, wrong
  format)? Rejected with a clear, specific message before anything is saved or
  dispatched.
- What happens to a pet's photo storage if the pet is later removed? The photo must be
  deleted along with the record, not orphaned.
- Slots 1-99 are shared across *every* permanent resident, family member, and employee
  on a given condominium's device (per `ARCHITECTURE.md` — this is not a new limit this
  feature introduces, but this feature is what will make that 99-slot ceiling a real,
  everyday constraint for the first time, versus today's single-admin-seeded resident
  per property).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A resident MUST be able to add a family member (name + phone) to their
  household profile.
- **FR-002**: A resident MUST be able to add a domestic employee (name + phone + RUT +
  vehicle plate) to their household profile.
- **FR-003**: Adding a family member or employee MUST dispatch a permanent-authorization
  command to the property's condominium device and track its confirmation, using the
  same dispatch/confirm decoupling already used for invitations (Constitution III) — not
  a new, separate mechanism.
- **FR-004**: A resident MUST be able to remove a family member or employee, which MUST
  dispatch a revocation command and, once confirmed, free the slot it held for reuse.
- **FR-005**: The household profile MUST show, for each family member and employee,
  whether their access is confirmed, still syncing, or failed — the same granularity
  already shown for invitations.
- **FR-006**: A resident MUST be able to add a pet (name + photo) to their household
  profile. Adding, viewing, or removing a pet MUST NOT dispatch any device command.
- **FR-007**: The system MUST validate a RUT's format (including its check digit) before
  accepting an employee record.
- **FR-008**: The system MUST reject adding a phone number that is already registered
  (as a resident, family member, or employee) on the same property, rather than creating
  a duplicate device entry.
- **FR-009**: When no permanent slot is available on a property's device, the system
  MUST clearly explain that to the resident at the moment they try to add a family
  member or employee, not fail silently or queue indefinitely.
- **FR-010**: RUT values MUST be treated as sensitive personal data: never included in
  audit-trail payloads or notification content (mirroring how visitor phone numbers are
  already excluded from audit payloads), and visible only to the household's own
  resident(s).
- **FR-011**: Pet photo uploads MUST be validated for size and format, with specific,
  actionable error messages on rejection.
- **FR-012**: Removing a pet MUST delete its stored photo, not leave it orphaned.

### Key Entities

- **Familiar (family member)**: name, phone (E.164), the property it belongs to, and its
  permanent-access sync state (slot, sync status) — structurally the same shape as the
  existing `Resident`/permanent-access concept, extended to allow more than one
  access-holder per property.
- **Empleado (employee)**: everything a family member has, plus RUT and vehicle plate as
  additional household-record fields that do not participate in device sync.
- **Mascota (pet)**: name and a photo. No relationship to the device at all — purely a
  household record.
- **Slot (existing concept, now under real contention)**: the RTU's permanent
  phonebook positions (1-99), shared across every resident, family member, and employee
  on one condominium's device — this feature is the first to make that a
  everyday-relevant shared resource rather than a one-per-property assumption.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A resident can add a family member or employee and see their gate access
  confirmed without any administrator involvement.
- **SC-002**: A resident can revoke a family member's or employee's access, and that
  person is no longer able to open the gate, without any administrator involvement.
- **SC-003**: 0 duplicate device entries are ever created for the same phone number.
- **SC-004**: 100% of invalid RUTs are rejected before being saved.
- **SC-005**: 0 RUT values ever appear in the audit trail or in any notification sent to
  a visitor or third party.
- **SC-006**: When a condominium's device has no free permanent slots, 100% of attempts
  to add a new family member or employee receive a clear explanation, not a silent
  failure.

## Assumptions

- "Empleados domésticos" (domestic staff — e.g. housekeepers, gardeners) are the
  intended employee relationship; this is a household-level record, not a
  condominium-wide staff directory (that would be an admin/P1-role feature, out of
  scope here — see `docs/ANALYSIS.md`'s "Funcionalidades Futuras").
- In-place editing of a synced family member's or employee's phone number is out of
  scope for this feature's first version — changing a number is done by removing the old
  entry and adding a new one (see Edge Cases). Editing non-synced fields (employee RUT/
  plate typo fixes, pet name/photo) is in scope and does not touch the device.
- Photo storage uses whatever object-storage capability the deployment already has
  available (Supabase Storage, matching the project's existing Supabase-centric
  infrastructure) — this spec does not mandate a specific provider beyond "the existing
  stack," left to `/speckit-plan`.
- The 99-slot ceiling is a hard hardware limit already documented in `ARCHITECTURE.md`;
  this feature does not attempt to work around it (e.g. no slot-recycling scheme beyond
  freeing slots on removal, which already exists for invitations).
- Contact-picker integration (letting a resident pick a family member/employee's name
  and phone from their phone's own contacts, discussed separately in this conversation)
  is a natural companion to this feature's "add" forms but is tracked as its own
  enhancement, not a requirement here — it is a pure UI convenience with no bearing on
  the access-granting logic this spec defines.
