# Quickstart: Validating the Resident Portal Redesign

Prerequisites: `web/.env.local` populated (Supabase creds at minimum — Twilio not needed
for pure UI validation since no RTU dispatch is exercised here); `npm run dev` in `web/`.

## 1. Mobile-first layout (US1, FR-001, FR-006, SC-001)

In the browser devtools device toolbar, set viewport to **375×667** (or an actual phone).
Visit `/login`, `/` (dashboard), and `/invitaciones/[id]` for an existing invitation.

- [ ] No horizontal scrollbar appears on any of the three pages.
- [ ] The "new invitation" form's fields and buttons are each comfortably tappable
      without zooming, with visible gaps between adjacent controls.
- [ ] Rotate to landscape (667×375) — content reflows and stays usable.

Repeat at **768×1024** (tablet) and **1440×900** (desktop) — layout should widen/adapt, not
just stay pinned at the mobile width.

## 2. Loading / error / empty states (US2, FR-002–FR-004, SC-002)

- [ ] On the dashboard, submit the "new invitation" form with throttled network (devtools
      → Network → Slow 3G) — the submit button shows a busy state and cannot be tapped
      again until the request resolves.
- [ ] Submit the form with invalid data (e.g. an empty required field, if reachable past
      HTML5 validation) or force a server error — confirm a plain-language message appears
      near the form, not a blank/broken page.
- [ ] As a resident with zero invitations (or temporarily clear the list), load the
      dashboard — confirm a helpful empty-state message with a path to "create invitation"
      appears instead of an empty table.
- [ ] On `/login`, request a magic link with throttled network — the submit button shows a
      busy state during the request.

## 3. Visual consistency (US3, FR-005, FR-008, SC-003, SC-004)

- [ ] Open login, dashboard, and invitation-detail side by side (or in sequence) — confirm
      headings, body text, buttons, and status badges use the same typography scale,
      spacing rhythm, and color language on all three.
- [ ] Run a contrast check (devtools accessibility panel, or a contrast-checker extension)
      against body text and badge text on the darkest and lightest surfaces used — confirm
      ≥4.5:1 in each case.
- [ ] Tab through each page using only the keyboard — confirm a visible focus indicator on
      every interactive element and a logical tab order.

## 4. No leftover manual controls (US4, FR-007, SC-005)

- [ ] Load the dashboard as a resident — confirm there is no "Procesar ciclo" button or any
      other control that manually advances the invitation lifecycle.
- [ ] Confirm `web/app/actions.ts` no longer exports `procesarCicloAction` (grep the
      codebase) — it should be fully removed, not just unused.

## Out of scope for this quickstart

RTU/Twilio behavior is unaffected by this feature — `specs/001-close-rtu-sync-loop`'s
quickstart still covers that separately.
