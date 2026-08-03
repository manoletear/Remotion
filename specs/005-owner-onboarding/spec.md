# Feature Specification: Owner Onboarding via Admin Invitation

**Feature Branch**: `005-owner-onboarding`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Onboarding de propietarios por invitación del administrador: hoy el vínculo entre una cuenta de auth y un residente es 100% manual (admin corre SQL a mano) — este feature lo vuelve self-service. El administrador del condominio (rol ADMIN, ya existe desde 004) invita a un propietario ingresando su teléfono y/o email (opcionalmente autocompletado desde la agenda del teléfono vía Contact Picker API — solo disponible en Android Chrome, degradar a input manual en el resto de navegadores) y seleccionando a qué propiedad pertenece. Solo el admin puede crear estas invitaciones de propietario (a diferencia de las invitaciones de visita, que cualquier residente ya puede crear para su propia propiedad). Al invitar, el sistema crea un registro de residente (tipo RESIDENT) en estado pendiente de reclamo y envía la invitación por email y/o SMS (Twilio, ya integrado) con un hipervínculo único a la webapp. WhatsApp queda fuera de este alcance (requiere plantillas pre-aprobadas de Meta) — placeholder para una fase futura. El propietario invitado abre el hipervínculo, se autentica (reutiliza el flujo de magic link/OTP que ya existe), y su cuenta de auth queda vinculada automáticamente a ese residente pre-creado (reemplaza el paso manual de admin-provisioned que hoy se hace con UPDATE perfiles a mano). El link de reclamo debe ser de un solo uso y expirar, para que no pueda ser interceptado o reutilizado por otra persona. Una vez reclamada su cuenta, el propietario entra a su entorno ya existente: gestionar sus invitaciones de visita por tiempo determinado, abrir el portón, y administrar a sus propios familiares y empleados domésticos (feature 003, ya construido) — nada de esto es nuevo, solo el paso de alta pasa de ser manual-por-SQL a self-service vía invitación. Mientras más completo el perfil del propietario (nombre, teléfono verificado), mejor la seguridad para el resto de los vecinos del condominio."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin invites a new owner (Priority: P1)

As the condominium admin, I add a new property owner by phone and/or email, assign the property they belong to, and the system sends them an invitation with a unique link so they can activate their own account — without me touching the database by hand.

**Why this priority**: This is the entire point of the feature. Today, linking an owner's login to their unit is a manual SQL step done by whoever is running the system; this replaces that with a self-service flow any admin can operate. Without this story there is no feature.

**Independent Test**: Can be fully tested by an admin submitting an owner's phone and/or email plus a property, confirming an invitation is sent, and confirming the invited person can open the link, authenticate, and land in a working resident portal.

**Acceptance Scenarios**:

1. **Given** I am logged in as the condominium admin, **When** I submit a new owner's phone and/or email and select one of the condominium's properties, **Then** a pending resident record is created for that property and an invitation is sent to the channel(s) provided, containing a unique claim link.
2. **Given** an invited owner opens their unique claim link and completes authentication, **When** authentication succeeds, **Then** their account is automatically linked to the pending resident record with no further admin action.
3. **Given** an owner has just claimed their invitation, **When** they land in their resident portal, **Then** they can immediately manage their own visit invitations, open the gate, and manage their household (family members and domestic employees) — the same capabilities existing residents already have.

---

### User Story 2 - Claim link cannot be hijacked or reused (Priority: P2)

As the condominium, I need an owner's claim link — sent over SMS or email, both interceptable channels — to be unusable by anyone except the intended owner and unusable more than once, so a compromised inbox or SMS can't be used to take over someone else's unit.

**Why this priority**: Directly protects the security promise the feature is built on (owner profile completeness → household security). Without this, the invitation link itself becomes the weakest point in the system.

**Independent Test**: Can be fully tested by attempting to open a claim link a second time after it was already used, attempting to open one after its expiration window has passed, and confirming an admin re-inviting the same pending owner invalidates the previous link.

**Acceptance Scenarios**:

1. **Given** a claim link that has already been used to successfully claim an account, **When** it is opened again, **Then** it is rejected with a clear "already used" message and no account changes occur.
2. **Given** a claim link older than its expiration window, **When** it is opened, **Then** it is rejected with a clear "expired" message, and the admin can send a fresh invitation.
3. **Given** an owner invitation that has not yet been claimed, **When** the admin sends a new invitation for that same pending owner, **Then** the previous claim link is invalidated so only the newest one works.

---

### User Story 3 - Pick the contact instead of typing it (Priority: P3)

As the admin, when inviting an owner I want to optionally select their name and phone number from my phone's contacts instead of typing them, on browsers that support it, so onboarding several owners in a row is faster.

**Why this priority**: A convenience layer on top of User Story 1's form. The feature is fully usable without it (manual typing always works); this only removes friction on supported devices.

**Independent Test**: Can be fully tested by opening the invite form on a supported mobile browser and confirming a contact picker fills the fields, and on an unsupported browser confirming the form still works with manual entry and no broken control is shown.

**Acceptance Scenarios**:

1. **Given** I am on a supported browser (Android Chrome), **When** I tap "elegir de contactos" on the invite form, **Then** my device's native contact picker opens and selecting a contact fills the name/phone fields.
2. **Given** I am on any other browser, **When** I open the invite form, **Then** I see a normal manual name/phone input and no contact-picker control that doesn't work.

---

### Edge Cases

- What happens when the admin invites a phone number or email that is already claimed by an existing account (anywhere in the system, not just this condominium)? The system must not silently create a conflicting or duplicate link, and must not reveal to the inviting admin whether that contact is already registered elsewhere (avoids leaking another condominium's membership).
- What happens when only a phone number is provided (no email), and SMS delivery to that number fails or the carrier blocks it? The admin needs visibility that the invitation didn't reach the owner, not silent success.
- How does the system handle an admin inviting the same phone/property pair a second time while the first invitation is still pending (not yet claimed, not yet expired)? (Covered by User Story 2, Scenario 3 — latest invitation wins.)
- What happens if the invited owner tries to authenticate with a different phone/email than the one the admin used to invite them? The claim must be tied to the invitation's contact channel, not to whatever identity the person happens to authenticate with.
- What happens when a claim link is opened but the owner never completes authentication (abandons partway)? The pending resident record and invitation remain valid until expiration; no partial/orphaned account should be created.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Only an authenticated admin (`rol = ADMIN`) MAY create an owner invitation, and only for properties within the condominium they administer.
- **FR-002**: Creating an owner invitation MUST create a resident record (tipo RESIDENT) in a pending-claim state for the selected property, without requiring the owner to already have an account.
- **FR-003**: The system MUST generate a unique, unguessable claim token for each invitation; a token MUST never be reused across invitations.
- **FR-004**: The system MUST send the invitation to whichever contact channel(s) the admin provided (email and/or SMS), with a link that embeds the claim token. WhatsApp delivery is out of scope for this feature.
- **FR-005**: A claim link MUST expire after a bounded time window; opening an expired link MUST be rejected with a clear message and MUST NOT link any account.
- **FR-006**: A claim link MUST become invalid immediately once used to successfully claim an account (single use); reopening it MUST be rejected and MUST NOT alter any account.
- **FR-007**: When an owner opens a valid, unexpired, unused claim link and completes authentication, the system MUST automatically link their auth account to the pending resident record with no manual admin step.
- **FR-008**: When an admin creates a new invitation for a pending (not yet claimed) resident record, the system MUST invalidate that resident's previous unclaimed claim link so at most one valid link exists per pending owner at a time.
- **FR-009**: The system MUST prevent a claim link from being used to link a resident record that has already been claimed by a different auth account (no double-claim, no account reassignment via this flow).
- **FR-010**: Once claimed, the owner's account MUST have the same capabilities already available to residents today — managing their own time-bound visit invitations, opening the gate, and managing their household (family members and domestic employees, per feature 003) — this feature only changes how the account comes into existence, not what it can do.
- **FR-011**: On a browser/device that exposes a native contact-picker capability, the admin MAY optionally use it to prefill an invitation's name/phone; on any browser without that capability, the admin MUST still be able to fill the same fields manually with no non-functional control shown.
- **FR-012**: The system MUST NOT reveal to an inviting admin whether a given phone number or email is already registered elsewhere in the system (no membership/enumeration leak).

### Key Entities

- **Owner Invitation**: Represents an outstanding offer for someone to claim ownership of a property. Holds which resident record it targets, which contact channel(s) it was sent to, its unique claim token, its status (pending / claimed / expired / invalidated), and when it expires.
- **Resident** *(existing entity, extended)*: Gains a pending-claim state that exists before any auth account is linked to it — the same record that, once claimed, is the resident an owner already manages today.
- **Admin** *(existing entity)*: The only actor permitted to create owner invitations, scoped to their own condominium's properties.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can invite a new owner (enter contact info, pick a property, send) in under 1 minute.
- **SC-002**: 100% of claim links opened after their expiration window are rejected, and 100% of claim links opened a second time after use are rejected.
- **SC-003**: An invited owner can go from receiving the invitation to successfully viewing their resident portal in under 5 minutes end-to-end, with zero manual steps from the admin after sending the invitation.
- **SC-004**: Zero owner invitations ever result in more than one auth account being linked to the same resident record.
- **SC-005**: On a supported mobile browser, an admin can fill an invitation's contact fields from their phone's contacts in a single interaction (zero manual keystrokes for the phone number).

## Assumptions

- A claim link's expiration window defaults to 7 days, consistent with common invitation-link practice; not user-configurable in this feature.
- At least one contact channel (phone or email) is required to create an invitation; both may be provided.
- One owner invitation links to exactly one resident record on exactly one property — a person who owns multiple units in the same or different condominiums is invited (and claims) separately per unit, consistent with today's one-to-one link between an auth account and a resident record.
- The existing magic-link/OTP authentication flow is reused as-is for the claim step; this feature does not change how a user proves who they are, only how their account gets connected to a resident record afterward.
- WhatsApp as an invitation channel is explicitly out of scope for this feature (requires Meta-approved message templates) and is left as a future enhancement.
- The Contact Picker convenience (User Story 3) is additive UI only; it has no effect on the invitation/claim data model or security guarantees in User Story 1 and 2.
