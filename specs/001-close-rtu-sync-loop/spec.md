# Feature Specification: Close the RTU Sync Loop in Production

**Feature Branch**: `001-close-rtu-sync-loop`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Cerrar en producción el ciclo completo de acceso (activación, confirmación y expiración) que hoy sólo corre contra fakes/demo — el condominio necesita que el sistema abra y cierre accesos por sí solo, de forma segura, sin que un humano dispare cada paso a mano."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access activates and expires without anyone driving it by hand (Priority: P1)

A resident creates a visitor invitation with a start and end time. Without any admin,
developer, or resident manually triggering anything, the invitation activates at its start
time (the visitor's number is authorized at the gate) and is removed at its end time (the
authorization is revoked). Today this only happens when someone manually clicks "Procesar
ciclo" in the dashboard — in production, with no one watching, invitations never activate.

**Why this priority**: This is the core promise of the product. Without it, CondoGATE is a
manual-trigger demo, not an access-management system residents can rely on.

**Independent Test**: Create an invitation with a start time in the near future and walk
away. Come back after the window has fully elapsed (start + end both passed) and confirm,
without having touched the dashboard, that the invitation shows `ACTIVE` shortly after start
and `REMOVED` shortly after end.

**Acceptance Scenarios**:

1. **Given** an invitation `CREATED` with a start time now in the past, **When** the
   system's clock advances past that time with no human interaction, **Then** the
   invitation reaches `ACTIVE` within one processing cycle.
2. **Given** an `ACTIVE` invitation whose end time has passed, **When** the system's clock
   advances with no human interaction, **Then** the invitation reaches `REMOVED` within one
   processing cycle.
3. **Given** the system has been idle (no invitations due) for an extended period, **When**
   a new invitation's window opens, **Then** it is still picked up on the next cycle — the
   absence of prior activity does not stall future processing.

---

### User Story 2 - The gate's own confirmation is what closes the loop (Priority: P1)

When the system sends an authorization or removal command to the physical gate, the gate
replies asynchronously (over SMS, potentially seconds to minutes later). That reply — not an
assumption that the command worked — is what moves the invitation to its final state
(`ACTIVE`/`REMOVED`) or flags it for retry (`ERROR`). Today the reply is never captured, so
every dispatched command sits half-finished forever, regardless of what the gate actually
did.

**Why this priority**: Without consuming the gate's reply, the system cannot tell the
difference between "the visitor can get in" and "the command silently failed" — the audit
trail and the retry mechanism both depend on this.

**Independent Test**: Dispatch an activation command to a device, have the device reply
"OK" out of band, and confirm the invitation transitions to `ACTIVE` on the next processing
cycle without any other trigger. Separately, have the device reply with a failure (or not
reply within the acknowledgement window) and confirm the invitation transitions to `ERROR`
and a retry is scheduled.

**Acceptance Scenarios**:

1. **Given** an invitation in `PENDING_SYNC` whose device has replied with success,
   **When** the next processing cycle runs, **Then** the invitation becomes `ACTIVE` and an
   event records the confirmation.
2. **Given** an invitation in `PENDING_SYNC` whose device has not replied within the
   acknowledgement window, **When** the next processing cycle runs, **Then** the invitation
   becomes `ERROR` with the reason recorded, and a retry is scheduled.
3. **Given** two invitations dispatched around the same time to the same device, **When**
   their replies arrive in a different order than they were sent, **Then** each invitation
   is resolved against its own correct reply, not the other's.

---

### User Story 3 - Only the real gate can report back (Priority: P2)

The channel the gate uses to report back (an inbound SMS webhook) only accepts messages that
are verifiably from the real messaging provider. An outsider who discovers the webhook URL
cannot fabricate a "the gate confirmed this" or "the gate rejected this" message.

**Why this priority**: This endpoint can flip physical-access state (`ACTIVE`/`REMOVED`).
An unauthenticated version of it is a way to force open or force-lock a gate remotely — a
physical-security hole, not a cosmetic one. P2 rather than P1 because it hardens a channel
that doesn't yet exist in production (User Story 2 must exist first).

**Independent Test**: Send a forged confirmation request without a valid provider signature
and confirm it is rejected and produces no state change; send the same payload with a valid
signature and confirm it is accepted.

**Acceptance Scenarios**:

1. **Given** an inbound confirmation request without a valid signature, **When** it
   reaches the system, **Then** it is rejected and no invitation state changes.
2. **Given** an inbound confirmation request with a valid signature, **When** it reaches
   the system, **Then** it is processed normally per User Story 2.

---

### Edge Cases

- What happens if the automatic cycle fails to run for a period (deploy issue, platform
  outage) and then resumes? Overdue invitations must still activate/expire on the next run,
  not be skipped because their window already passed.
- What happens if the gate's confirmation for one command arrives twice (duplicate
  delivery)? Processing it twice must not double-apply the state transition or corrupt the
  audit trail.
- What happens when an invitation exhausts its retry attempts without ever confirming?
  It must land in a final, clearly-flagged state that a human can act on — it must not spin
  retries forever, and it must not silently disappear.
- The RTU device's own reply format (how it encodes phone numbers over SMS) must be
  correctly understood — as evidence this is easy to get subtly wrong, the current
  automated test suite for the device-protocol layer has known failing assertions from a
  recent real-device correction that were never reconciled; that inconsistency is a
  prerequisite gap this feature must close before anything above it can be trusted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST advance the invitation lifecycle (activation and expiration) on a
  recurring, automatic cycle with no human action required, once deployed.
- **FR-002**: System MUST dispatch the gate-authorization command when an invitation's
  start time arrives, and the gate-removal command when its end time arrives.
- **FR-003**: System MUST capture the gate's asynchronous reply to a dispatched command and
  use it — not an assumption of success — to resolve the invitation to `ACTIVE`, `REMOVED`,
  or `ERROR`.
- **FR-004**: System MUST NOT block the automatic cycle waiting for a gate reply; dispatch
  and confirmation are separate steps that may complete on different cycle runs.
- **FR-005**: System MUST reject any inbound gate-confirmation message that cannot be
  verified as originating from the real messaging provider, and MUST take no state action
  on it.
- **FR-006**: System MUST record an auditable event for every dispatch, every confirmation,
  and every rejected/unverified inbound message.
- **FR-007**: System MUST retry, with growing backoff up to an existing configured limit, an
  invitation stuck in `ERROR` due to a failed or missing gate confirmation, until it either
  succeeds or exhausts its retry budget into a final flagged state.
- **FR-008**: System MUST process a duplicate or out-of-order gate reply without corrupting
  the state of the invitation it belongs to, or of any other invitation.
- **FR-009**: System MUST correctly interpret and produce the gate's own message format
  (including its phone-number encoding) so that dispatched commands and parsed replies match
  what the physical device actually sends and expects.

### Key Entities

- **Ciclo automático (scheduler tick)**: the recurring trigger that advances due
  invitations. Must run unattended, on a schedule, with no dashboard button involved.
- **Confirmación entrante (inbound gate reply)**: an asynchronous, provider-verified message
  correlating to a previously-dispatched command; the sole basis for resolving `PENDING_SYNC`
  → `ACTIVE` or `REMOVING` → `REMOVED`.
- **Evento de auditoría**: the immutable record of every dispatch, confirmation, retry, and
  rejected inbound attempt (already modeled; this feature is a consumer, not a redesigner,
  of that entity).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invitation created with a future window activates and later expires with
  zero manual intervention, end to end, in a production deployment.
- **SC-002**: 100% of gate confirmations (success or failure) received while the system is
  running are reflected in the corresponding invitation's state within one processing cycle.
- **SC-003**: 0 unverified/forged inbound messages are able to change any invitation's
  state.
- **SC-004**: An invitation that fails to confirm reaches a final, human-actionable state
  (not an infinite retry loop, not a silent stall) within its configured retry budget.
- **SC-005**: The automated test suite for the device-protocol and lifecycle layers passes
  at 100% (no known-failing assertions) before this feature is considered complete.

## Assumptions

- The scheduler's recurring trigger is provided by the hosting platform's own cron
  capability (already assumed elsewhere in the project) — this feature defines the
  behavior the trigger must invoke, not a new triggering mechanism.
- The messaging provider used for the gate's SMS channel offers a standard
  request-signing/verification mechanism for inbound webhooks; this feature relies on that
  mechanism rather than inventing a new one.
- Fixing the two currently-failing protocol-layer unit tests is in scope as a prerequisite
  (Edge Cases, FR-009, SC-005) — it is foundational to trusting the rest of this feature,
  not a separate, independent user story.
- Real-hardware validation against a physical RTU5024 (rather than the fake gateway) remains
  a follow-on validation step and is not required for this feature's user stories to be
  considered functionally complete against their independent tests.
