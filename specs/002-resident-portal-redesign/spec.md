# Feature Specification: Resident Portal Visual/UX Redesign

**Feature Branch**: `002-resident-portal-redesign`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Rediseño visual/UX del portal web de residentes (dashboard de
invitaciones, login, detalle de invitación). El front actual es HTML plano sin sistema de
diseño real: sin escala tipográfica, sin breakpoints responsive, sin estados de carga/error/
vacío consistentes, y con un botón 'Procesar ciclo' que ya quedó obsoleto ahora que
/api/tick corre automáticamente en producción. Es una herramienta de utilidad (gestión de
accesos), no un producto de consumo — debe transmitir seguridad y confianza, ser clara para
residentes de cualquier edad/nivel técnico, y usarse mayormente desde el celular."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the portal comfortably on a phone (Priority: P1)

A resident opens the portal on their phone — the primary device for this audience — to
check their invitations or create a new one. Every screen fits the phone's width, every
button and input is easy to tap without zooming, and nothing requires horizontal scrolling.

**Why this priority**: If the portal is unusable on a phone, it is unusable for most of the
actual audience — this is the baseline, not a nice-to-have.

**Independent Test**: Load each of the three screens (login, dashboard, invitation detail)
at a 375px-wide viewport and complete the primary action of each (log in, create an
invitation, view a detail) without horizontal scrolling, zooming, or mis-tapping an adjacent
control.

**Acceptance Scenarios**:

1. **Given** a resident on a 375px-wide phone screen, **When** they open the dashboard,
   **Then** all content (header, form, invitation list) fits the width with no horizontal
   scrollbar.
2. **Given** a resident filling the "new invitation" form on a phone, **When** they tap any
   input or button, **Then** the tap lands reliably without accidentally hitting a
   neighboring control.
3. **Given** a resident rotates their phone to landscape, **When** the layout reflows,
   **Then** the page remains usable and readable.

---

### User Story 2 - Always know what the system is doing (Priority: P1)

A resident creates or cancels an invitation, or requests a login link. While the action is
processing, they see a clear loading indication; when it succeeds, they see confirmation;
when it fails, they see a plain-language explanation of what went wrong and what to do next
— never a blank screen, a raw error string, or silence.

**Why this priority**: This is an access-control tool — a resident who can't tell whether
their invitation was actually created will either double-submit it or lose trust in the
system. Silent/unclear failure states are the single biggest source of support confusion in
tools like this.

**Independent Test**: Trigger each of create-invitation, cancel-invitation, and
request-login-link under a slow/failing condition and confirm a loading state appears
immediately and a clear success or error outcome appears when it resolves.

**Acceptance Scenarios**:

1. **Given** a resident submits the "new invitation" form, **When** the request is in
   flight, **Then** the submit control shows a busy/loading state and cannot be tapped again
   until it resolves.
2. **Given** a request fails (e.g. the invitation cannot be created), **When** the failure
   is shown, **Then** the message explains what went wrong in plain language and appears
   next to the relevant form, not as a generic full-page error.
3. **Given** a resident has no invitations yet, **When** they view the dashboard, **Then**
   they see a helpful empty-state message pointing them at the "new invitation" action,
   not a blank list.

---

### User Story 3 - The portal looks and feels like a security tool, consistently (Priority: P2)

Across login, dashboard, and invitation detail, the resident sees one consistent visual
language — the same typography scale, spacing, color use, and component styling — that
reads as a serious, trustworthy utility rather than a generic consumer app or an unstyled
form.

**Why this priority**: Consistency and a considered visual tone build the trust this kind
of tool depends on; it is P2 because the portal is functional without it — this is a
quality/perception improvement layered on top of User Stories 1–2, not a blocker to basic
use.

**Independent Test**: Visually compare all three screens side by side and confirm shared
typography scale, spacing rhythm, color usage, and component styling (buttons, inputs,
badges) with no page looking visually unrelated to the others.

**Acceptance Scenarios**:

1. **Given** a resident navigates from login to the dashboard to an invitation detail,
   **When** they compare the three screens, **Then** headings, body text, buttons, and
   status badges look and behave the same way on every screen.
2. **Given** a resident with reduced vision or in bright sunlight, **When** they read any
   text on the portal, **Then** the text has enough contrast against its background to read
   comfortably.

---

### User Story 4 - No confusing leftover controls (Priority: P2)

The dashboard no longer shows the manual "Procesar ciclo" button. That control existed only
because, during early development, nothing else advanced the invitation lifecycle — now
that the system does this automatically and continuously in production, a resident-facing
manual trigger for it is confusing (what does clicking it do? why would a resident need to?)
and out of place next to their own invitation-management actions.

**Why this priority**: P2 — it's a real point of confusion but not a blocker; a resident can
still use the portal fully with the stray control present, they're just puzzled by it.

**Independent Test**: Load the dashboard as a resident and confirm no control for manually
advancing/processing the system's lifecycle is present anywhere on the page.

**Acceptance Scenarios**:

1. **Given** a resident views the dashboard, **When** they look for actions available to
   them, **Then** they see only actions relevant to their own invitations (create, cancel,
   view detail) — no system-level or administrative controls.

---

### Edge Cases

- What happens when a resident has a very long list of invitations? The list must remain
  scannable (scrolling within the list/page, not layout breakage) rather than pushing the
  page to an unusable length or breaking the layout.
- What happens on a very old/small phone screen (under 360px) or a very large desktop
  monitor? The layout must degrade/scale gracefully at both ends, not just at the specific
  width it was designed against.
- What happens if a resident has a screen reader or navigates by keyboard only (e.g. a
  motor-impaired resident, or a family member helping remotely)? All primary actions must
  remain reachable and understandable without a mouse or without sight.
- What happens when the network is slow and a loading state persists for several seconds?
  The resident must still be able to tell the system is working, not stalled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The portal MUST render without horizontal scrolling on viewports as narrow as
  375px, and remain usable up to typical desktop widths.
- **FR-002**: Every action that takes noticeable time (creating/cancelling an invitation,
  requesting a login link) MUST show a visible loading/busy state while pending, and MUST
  prevent duplicate submission during that time.
- **FR-003**: Every error MUST be shown in plain language, positioned next to the action or
  field it relates to, and MUST NOT be a raw technical error string.
- **FR-004**: An empty list of invitations MUST show a helpful message and a clear path to
  create a new one, not a bare empty table.
- **FR-005**: Typography, spacing, and color usage MUST be defined once (a shared scale/
  token set) and applied consistently across login, dashboard, and invitation-detail pages.
- **FR-006**: All interactive controls (buttons, inputs, links) MUST have a comfortably
  tappable size and spacing from neighboring controls.
- **FR-007**: The dashboard MUST NOT present any control for manually advancing the
  invitation lifecycle to residents.
- **FR-008**: Body text MUST maintain accessible contrast against its background in the
  portal's color scheme.
- **FR-009**: The portal MUST remain usable via keyboard navigation alone (tab order,
  visible focus) for all primary actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A resident can complete the full "create an invitation" flow on a
  375px-wide phone screen without any horizontal scrolling or pinch-zooming.
- **SC-002**: 100% of async actions (create, cancel, login-link request) show a visible
  state change within 300ms of being triggered — no action ever appears to do nothing when
  tapped.
- **SC-003**: A visual consistency check across login, dashboard, and invitation-detail
  finds zero mismatched typography, spacing, or color usage between pages.
- **SC-004**: All body text in the portal's color scheme meets a 4.5:1 contrast ratio
  against its background.
- **SC-005**: Zero resident-facing controls for manually driving the system's internal
  lifecycle remain visible after the redesign ships.

## Assumptions

- The existing dark color scheme is a reasonable starting point (already reasonably
  considered — dark navy background, defined accent color) and will be formalized into a
  consistent token system rather than replaced outright with a light theme; a full
  light/dark toggle is out of scope unless requested separately.
- "Residents of any age/technical level" implies favoring clarity, larger touch targets,
  and plain-language copy over dense/compact information display.
- No new pages or functionality are introduced by this feature — it restyles and improves
  the interaction quality of the three screens that already exist (login, dashboard,
  invitation detail). An admin panel or new resident-facing pages are out of scope (see
  `docs/ANALYSIS.md`'s "Funcionalidades Futuras" for that separate track).
- Removing the "Procesar ciclo" control (User Story 4) assumes `/api/tick` (shipped in
  `specs/001-close-rtu-sync-loop`) is the system's sole lifecycle driver going forward; no
  other manual-trigger use case for it remains.
