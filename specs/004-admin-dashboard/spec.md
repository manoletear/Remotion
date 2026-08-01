# Feature Specification: Admin Dashboard (Condominium-Wide, Read-Only)

**Feature Branch**: `004-admin-dashboard`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "En esta plataforma tenemos dos vistas: la del usuario
residente y el usuario administrador, quien lleva el registro de todos los movimientos
en el condominio y también tiene el registro de todas las familias, familias de paso,
etc." Clarified with the user: "familias de paso" refers to the existing visitor
invitations (no new entity), and the admin's scope is **read-only** — see everything in
the condominium (audit trail, every property, every resident/family member/employee,
every invitation) — not provisioning, not acting on other residents' behalf.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every access event across the condominium (Priority: P1)

An administrator opens a dashboard and sees the audit trail (bitácora) for the whole
condominium — not just one property — with enough context per event (which property,
which person/visitor, what happened, when) to answer "who authorized what, and when"
for any unit, without asking a resident or digging through the database by hand.

**Why this priority**: This is the concrete problem statement ("lleva el registro de
todos los movimientos") — everything else in this feature is supporting context for
this central view.

**Independent Test**: As an admin, load the dashboard and find an event that belongs to
a property that is not the admin's own — confirm it's visible with the property it
belongs to identified.

**Acceptance Scenarios**:

1. **Given** an admin account, **When** they open the dashboard, **Then** they see
   audit events from every property in the condominium, each labeled with which
   property it belongs to.
2. **Given** a resident account (not admin), **When** they try to reach the same
   dashboard, **Then** they cannot see other properties' data — the existing
   per-property isolation is unchanged for residents.

---

### User Story 2 - See every household across the condominium (Priority: P1)

An administrator sees a directory of every property with its residents, family
members, and domestic employees — not just a count, enough to identify who currently
has permanent gate access and through which property.

**Why this priority**: Equal priority to User Story 1 — "el registro de todas las
familias" is the other half of the stated need, and an admin who can see *events* but
not *who they're about* only has half the picture.

**Independent Test**: As an admin, find a family member or employee belonging to a
property that is not the admin's own, and confirm their name, phone, and access status
are visible.

**Acceptance Scenarios**:

1. **Given** an admin account, **When** they view the household directory, **Then**
   every property's residents, family members, and employees are listed, each showing
   their current access status.
2. **Given** an employee record with a RUT on file, **When** an admin views the
   directory, **Then** the RUT is visible to the admin (unlike a co-resident, who never
   sees another household's data at all) — this is the one case where RUT visibility
   extends beyond the household itself, and it is intentional (an administrator
   overseeing the whole condominium), not a leak.

---

### User Story 3 - See every visitor invitation across the condominium (Priority: P1)

An administrator sees every visitor invitation ("familias de paso") across every
property — visitor name, phone, time window, and status — not just the count.

**Why this priority**: The explicit third thing named in the request. P1 alongside
Stories 1-2 because together they ARE the feature — a "registry of movements" that only
covered permanent residents but not visitors would be an incomplete audit story.

**Independent Test**: As an admin, find an invitation belonging to a property that is
not the admin's own and confirm it's visible with its property identified.

**Acceptance Scenarios**:

1. **Given** an admin account, **When** they view the invitations list, **Then** every
   property's invitations are shown, each labeled with which property it belongs to.

---

### Edge Cases

- What happens when the condominium has many properties/events (growth beyond today's
  single-condominium MVP scale)? The dashboard must remain scannable — this spec does
  not require full-text search or advanced filtering on day one, but the data MUST NOT
  be silently truncated without indicating that more exists (e.g., "showing the most
  recent 100 of 400 events," not just stopping at 100 with no indication).
- What happens if someone without the admin role tries to reach the dashboard's URL
  directly? They MUST be denied at the same enforcement layer that already isolates
  residents from each other (RLS), not merely hidden from navigation.
- What happens to an admin who is also a resident of a unit in the same condominium (a
  plausible real setup for a small condo)? Their own property's data is a subset of
  what they can already see as admin — no special-casing needed, admin visibility is a
  superset.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support an "administrator" role, distinct from the
  existing resident role.
- **FR-002**: An administrator MUST be able to view audit events for every property in
  their condominium, each identified by which property it belongs to.
- **FR-003**: An administrator MUST be able to view every property's residents, family
  members, and domestic employees, including each one's current permanent-access
  status.
- **FR-004**: An administrator MUST be able to view every property's visitor
  invitations, including status and time window.
- **FR-005**: A non-administrator (resident) MUST continue to see only their own
  property's data — this feature MUST NOT weaken that existing isolation.
- **FR-006**: Administrator access MUST be enforced at the database level (the same
  authority residents' own isolation already relies on), not only hidden in the UI.
- **FR-007**: This feature is read-only for the administrator — creating, editing, or
  cancelling any resident's, family member's, employee's, or invitation's data on their
  behalf is explicitly out of scope (see Assumptions).

### Key Entities

- **Administrator**: an existing `perfiles` row with a role value distinguishing it
  from a resident — not a new table, a new value on an existing one (the schema already
  reserved this seam when the resident-linking design was built).
- No other new entities — this feature is a new *view* over data that already exists
  (`eventos`, `residentes`, `invitaciones`, `propiedades`), scoped by condominium
  instead of by property.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can find any property's audit history without needing
  database access or asking a resident.
- **SC-002**: An administrator can identify every person (family member or employee)
  currently holding permanent gate access anywhere in the condominium from one screen.
- **SC-003**: An administrator can identify every active or past visitor invitation
  anywhere in the condominium from one screen.
- **SC-004**: A non-administrator's access to other properties' data remains exactly as
  restricted as it is today (0 regressions to existing resident isolation).

## Assumptions

- Read-only, per the user's explicit scoping: provisioning (creating condominiums/
  properties/residents from the UI) and acting on another resident's behalf (creating/
  cancelling their invitations or household members) are both out of scope — these
  remain `docs/ANALYSIS.md`'s already-documented "Funcionalidades Futuras" (V2 admin
  role), not part of this feature.
- "Familias de paso" = the existing `Invitation` entity; no new domain concept.
- Admin accounts are provisioned the same way the one existing resident account was —
  manually (e.g. a seed script or a direct `perfiles` update setting `rol = 'ADMIN'`) —
  a self-service "become an admin" flow is out of scope.
- Single condominium in the MVP (per `docs/ANALYSIS.md`), so "condominium-wide" and
  "everything in the system" are the same scope today; the design should scope by
  condominium (not hardcode "everything") so it still behaves correctly if a second
  condominium is ever provisioned.
