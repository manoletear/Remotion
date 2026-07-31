---

description: "Task list for feature implementation"
---

# Tasks: Resident Portal Visual/UX Redesign

**Input**: Design documents from `/specs/002-resident-portal-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md (all present; no
data-model.md/contracts — this feature adds no entities or API surface)

**Tests**: No automated UI test framework exists in this project (per plan.md's Technical
Context). Validation is manual via `quickstart.md`, referenced per story below.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent
implementation and validation of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3/US4)

## Path Conventions

Paths are relative to `Remotion/web/`, per `plan.md`'s Project Structure. No `src/`
(domain package) or API route files are touched by this feature.

---

## Phase 1: Setup

- [X] T001 [P] Catalog done via direct review: `statusBadge()`'s inline hex pairs,
      `login/page.tsx`'s inline `maxWidth`/`margin` and `"var(--red, #c00)"` fallback,
      the cancel-form's inline `marginTop: 16`, and the un-scaled px values throughout
      `.panel`/`.field`/`.grid2`/buttons — all addressed in Phases 2–5 below.

**Checkpoint**: Know exactly what today's ad-hoc values are before replacing them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story below can be considered done until its styling actually uses
these tokens — building the tokens first avoids re-doing story work when the scale changes.

- [X] T002 Type scale (`--text-xs/sm/base/lg/xl/2xl` = 12/14/16/18/24/32) defined in
      `web/app/globals.css`, applied to `h1`/`h2`/body/`.muted`/`.badge`/table cells.
- [X] T003 [P] Spacing scale (`--sp-1` through `--sp-8`, 4px rhythm) defined and applied
      throughout `.panel`, `.field`, `.grid2`, buttons, `.toolbar`.
- [X] T004 [P] Semantic tokens defined as **5** pairs, not 4 — `--info`/`--progress`/
      `--success`/`--neutral`/`--danger`, matching the invitation lifecycle's actual states
      (PENDING_SYNC/REMOVING genuinely need an "in progress" tone distinct from a generic
      warning) — see research.md's added decision. Reused the app's existing hand-tuned
      hex pairs (already reasonable contrast), just centralized them as tokens.
- [X] T005 `min-width: 768px`/`1024px` breakpoints added for `.container`, `.toolbar`,
      `.grid2` in `web/app/globals.css`.
- [X] T006 [P] `.busy` (spinner, `prefers-reduced-motion`-aware) and `.field-error` added;
      also added `.empty-state` (needed by T013) and `:focus-visible` (needed by T017) in
      the same pass since they're all part of one cohesive CSS file edit.

**Checkpoint**: A real design system exists in `globals.css`; every user story phase below
consumes it rather than inventing new ad-hoc values.

---

## Phase 3: User Story 1 - Use the portal comfortably on a phone (Priority: P1) 🎯 MVP

**Goal**: All three screens are usable at 375px and scale up cleanly.

**Independent Test**: Load each screen at 375px and complete its primary action without
horizontal scroll or mis-taps (quickstart.md section 1).

- [X] T007 [US1] `.container`/`.toolbar`/`.grid2` are pure CSS-driven (no JSX changes
      needed) — mobile stacks by default, `.toolbar` goes row + `.grid2` goes 2-column at
      768px, `.container` widens again at 1024px.
- [X] T008 [US1] `min-height: 44px` applied globally to `input`, `select`, `button` in
      `globals.css` — covers every form control across all three screens in one place
      rather than auditing per-element.
- [~] T009 [US1] **Build-verified, not device-verified.** `npm run build` (web) compiles
      clean and the deployed app (https://condogate-ten.vercel.app) is live. Actual
      375/768/1024/1440 visual passes need a human looking at a real/emulated device —
      recommend doing this now that it's deployed.

**Checkpoint**: User Story 1 fully functional and testable independently.

---

## Phase 4: User Story 2 - Always know what the system is doing (Priority: P1)

**Goal**: Every async action shows busy/success/error state; empty list has a helpful
message.

**Independent Test**: Trigger create/cancel/login-link under a slow/failing condition and
confirm visible feedback throughout (quickstart.md section 2).

- [X] T010 [US2] New `web/app/new-invitation-form.tsx` (client component,
      `useActionState`) wraps `crearInvitacionAction`. `crearInvitacionAction` itself
      changed shape: `(formData) => Promise<void>` (threw on failure → generic Next.js
      error page, the exact bug hit live during testing today) → `(prevState, formData) =>
      Promise<ActionState>` (catches, returns `{error}`, rendered inline via
      `.field-error`).
- [X] T011 [US2] Cancel forms (dashboard row + detail page) now use the new
      `web/app/components/submit-button.tsx` (`useFormStatus`, reusable — didn't need
      `useActionState` since cancel doesn't need inline error display, just pending state)
      for the `.busy` treatment. **Deviation**: did not add full inline-error handling to
      cancel (kept `cancelarInvitacionAction`'s existing throw-on-failure) — cancel failures
      are an edge case not in the acceptance scenarios; busy-state alone satisfies FR-002
      for it.
- [X] T012 [US2] New `web/app/login/login-form.tsx` (client component) replaces the old
      inline-closure server action + redirect/searchParam flow entirely — `sendMagicLinkAction`
      now takes `(prevState, formData)` for `useActionState` compat, returns `{sent}` or
      `{error}` directly instead of redirecting to `/login?sent=1`/`/login?error=...`.
      `/login`'s own `?error=` (from `/auth/callback` redirects) is still supported, seeded
      as `initialError` into the same component.
- [X] T013 [US2] `.empty-state` block added in `web/app/page.tsx` with a message + pointer
      to the form above (the form is always on the same page, so no separate link needed).
- [~] T014 [US2] **Build-verified only** — same caveat as T009; live loading/error/empty
      states need a human to actually trigger them once, though the underlying bug they
      were built to guard against (the eventos RLS failure) was already hit and fixed live
      during today's testing session.

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - The portal looks and feels like a security tool, consistently (Priority: P2)

**Goal**: One shared visual language across all three screens; accessible contrast and
keyboard navigation.

**Independent Test**: Compare all three screens for shared type/spacing/color use, run a
contrast check, and tab through with a keyboard only (quickstart.md section 3).

- [X] T015 [US3] `statusBadge()` now returns `{label, tone}` (`tone` is one of the 5
      semantic tokens from T004) instead of `{label, bg, fg}` hex pairs; both call sites
      (`page.tsx`, `invitaciones/[id]/page.tsx`) switched from inline `style={{...}}` to
      `className={`badge ${b.tone}`}`.
- [X] T016 [US3] Swept and replaced: login's inline `maxWidth`/`margin` → `.auth-panel`
      class; the broken `"var(--red, #c00)"` fallback → `.field-error` (uses the real
      `--danger-fg` token); the cancel-form's inline `marginTop: 16` → `.mt-5` class.
- [X] T017 [US3] `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`
      added globally in `globals.css`.
- [~] T018 [US3] **Build-verified only** — contrast/keyboard-nav passes need a human;
      the tokens themselves reuse pre-existing hand-tuned hex pairs (light-on-dark,
      same-hue), which is a reasonable basis for a pass but wasn't independently
      re-measured against 4.5:1 in this session.

**Checkpoint**: All three user stories independently functional; portal reads as one
consistent product.

---

## Phase 6: User Story 4 - No confusing leftover controls (Priority: P2)

**Goal**: The dashboard shows no resident-facing manual lifecycle control.

**Independent Test**: Load the dashboard and confirm no "Procesar ciclo"-equivalent control
exists anywhere (quickstart.md section 4).

- [X] T019 [US4] Removed the "Procesar ciclo" button + form from `web/app/page.tsx`.
- [X] T020 [US4] Removed `procesarCicloAction` and its now-unused `tick` import from
      `web/app/actions.ts`.
- [X] T021 [US4] `grep -rn "procesarCicloAction" web/` returns nothing — confirmed gone.

**Checkpoint**: All four user stories independently verifiable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T022 [P] `npm run build` (web): clean, all 7 routes intact (`/`, `/login`,
      `/invitaciones/[id]`, `/auth/callback`, `/api/tick`, `/api/sms/inbound`, plus the
      temporary `/api/dev/login` from live debugging — not part of this feature, see
      `specs/001-close-rtu-sync-loop`'s follow-ups).
- [~] T023 **Not fully re-run.** Deployed to production (https://condogate-ten.vercel.app)
      and build-verified; the live, human-driven quickstart.md pass (T009/T014/T018) is the
      one remaining step before calling SC-001–SC-005 fully satisfied.

### Discovered during implementation (not in the original task list)

- `createInvitation`'s audit-event write (`ctx.store.events.append`) was going through
  the RLS-scoped session client, but `eventos` has RLS enabled with **no** write policy
  for authenticated users (migration 0004 — audit writes are meant to come from
  service-role skills/workers only). This made every real invitation creation throw
  *after* the invitation row was already committed (visible on reload, but the request
  itself 500'd) — found live during today's testing. Fixed in
  `specs/001-close-rtu-sync-loop`'s territory (`web/lib/context.ts`), not this feature's
  files, but directly enabled this feature's US2 (error-state) work to be tested for real.
- `sendMagicLinkAction` originally used `auth.admin.generateLink()`, which generates a
  link but never sends it — no magic-link email was ever delivered. Fixed to
  `auth.signInWithOtp()` via a cookie-aware (`@supabase/ssr`) client, which also fixed a
  follow-on PKCE code-verifier issue (a bare `createClient()` anon client defaults to the
  implicit flow, which produces a `#token` fragment `/auth/callback` can't read server-side).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 can start immediately
- **Foundational (Phase 2)**: Logically follows T001's catalog, but T002-T006 mostly touch
  the same file (`globals.css`) sequentially in practice, though T003/T004/T006 don't
  depend on each other's *values* — mark `[P]` only loosely; expect to serialize edits to
  avoid merge conflicts within one file
- **User Stories (Phase 3+)**: All depend on Phase 2 completing (they consume its tokens).
  US1 and US2 are both P1 and independent of each other. US3 depends on US1/US2's markup
  existing (it's a consistency sweep over what they touched) — do it after, not in
  parallel. US4 is fully independent of US1-US3 and could be done anytime after Phase 1.
- **Polish (Phase 7)**: After all desired stories are complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P1)**: Depends on Phase 2 only (specifically T006). Independent of US1's layout
  changes.
- **US3 (P2)**: Best done after US1+US2 (T016's "sweep for remaining inline styles" is more
  useful once those stories' new markup exists), but not a hard blocker.
- **US4 (P2)**: Fully independent — could even be done first as a quick win.

### Parallel Opportunities

- T001 (Phase 1) has no dependents blocking it — start immediately
- T003, T004, T006 (Phase 2) touch independent concerns within the same file — coordinate
  rather than truly parallelize
- T019-T021 (US4) can run in parallel with any other story's work — different files/concern
  entirely

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Define spacing scale in web/app/globals.css"
Task: "Define semantic color tokens in web/app/globals.css"
Task: "Add .busy/.field-error interaction-state CSS in web/app/globals.css"
# (in practice: same file, so land these as one coordinated edit rather than 3 concurrent ones)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 together — both P1)

1. Phase 1 (Setup) → Phase 2 (Foundational — the actual design system)
2. Phase 3 (US1: responsive layout) + Phase 4 (US2: loading/error/empty states)
3. **STOP and VALIDATE**: quickstart.md sections 1-2
4. Deploy — the portal is now usable and legible on a phone with clear feedback

### Incremental Delivery

1. Setup + Foundational → the design system exists
2. US1 + US2 → the MVP: usable, legible, communicative → Deploy
3. US3 → consistency/accessibility polish → Deploy
4. US4 → remove the confusing leftover control (can also be done any time, it's isolated)
5. Polish → final build + full quickstart pass

---

## Notes

- This feature touches no `src/` (domain package) files and no API routes — `npm test`
  (domain suite) is unaffected; `npm run build` (web) is the real regression gate.
- Every task names its exact file path; none require additional context to start.
- Commit after each phase or logical group; stop at each checkpoint to validate before
  moving on.
