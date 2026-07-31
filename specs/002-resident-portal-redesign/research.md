# Research: Resident Portal Visual/UX Redesign

No `[NEEDS CLARIFICATION]` markers were left in the spec or Technical Context. This
document records the design-system decisions behind `plan.md`, informed by the
`ui-ux-pro-max` skill's design-quality checklist (its `search.py` CLI tool was unavailable
in this environment — its `scripts/`/`data/` were empty on disk — so its written Quick
Reference guidance was applied directly instead of via the tool).

## Decision: Adopt SafeCard's visual language, not its feature set

**Decision**: The user shared a screenshot of SafeCard (a competing access-control app,
see earlier cross-check) as a visual reference and confirmed scope explicitly: adopt its
**visual language only** — large, color-coded circular action targets (green/red,
paired with icon + label, never color alone), a bottom tab bar for primary navigation,
and a compact system-status row — applied to CondoGATE's *existing* three screens
(login, dashboard, invitation detail). Explicitly **not** adopted: SafeCard's
instant-remote-open buttons ("Entrada"/"Salida" that trigger the gate immediately) —
CondoGATE's MVP is phone-number/time-window based (the RTU recognizes an authorized
caller), a materially different mechanism; adding instant remote-open would be a new
capability requiring its own spec, not a restyle.

**Rationale**: SafeCard's screen is a strong reference for exactly what FR-001/FR-006/
SC-001 already call for (large touch targets, mobile-first, color+icon+label) — it's
independent validation of `ui-ux-pro-max`'s guidance applied to this exact product
category (physical access control), not a new direction. Keeping it scoped to visual
language avoids scope creep into an unplanned instant-open feature mid-restyle.

**Alternatives considered**: Also copying the instant-open buttons — rejected for now
per explicit user scoping; revisit as a separate feature (would need RTU5024 protocol
research: does the device open on an inbound call vs. only phonebook SMS commands,
and would `TWILIO_FROM` need Voice capability, not just SMS).

## Decision: Keep the existing dark theme, formalize it into tokens

**Decision**: Keep `--bg`/`--panel`/`--border`/`--text`/`--muted`/`--accent` as the base
palette (already a reasonable, considered starting point — dark navy, not pure black;
one accent blue) and add semantic tokens on top: `--success`, `--warning`, `--danger`,
`--info` (each a bg/fg pair), replacing `web/lib/format.ts`'s per-status inline hex pairs.

**Rationale**: Spec Assumptions explicitly rule out a theme replacement or light/dark
toggle for this pass. `ui-ux-pro-max`'s "Style Selection" and "Typography & Color"
guidance (`color-semantic`, `dark-mode-pairing`) calls for semantic tokens over ad-hoc
hex — exactly what `statusBadge()` currently lacks — without requiring a palette change.

**Alternatives considered**: A full light-mode + toggle — rejected per spec Assumptions
(explicitly out of scope). A different accent color — no reason found to change it; the
existing blue reads as calm/trustworthy, appropriate for a security tool.

## Decision: No CSS framework/component library

**Decision**: Continue with plain CSS (`globals.css`) + a few more utility classes, no
Tailwind/shadcn/MUI/etc. added.

**Rationale**: The project has zero UI dependencies today and a very small surface (3
screens). Introducing a framework is a larger, harder-to-reverse decision (new
dependency, new authoring convention, larger bundle) than this restyling pass calls for.
If the portal grows substantially (admin panel, more screens — see `docs/ANALYSIS.md`'s
V2 list), that's the point to revisit, not now.

**Alternatives considered**: Tailwind CSS — would give a spacing/color scale "for free,"
but the existing `globals.css` approach already gets there for 3 screens without adding a
build-time dependency; revisit if scope grows.

## Decision: Mobile-first breakpoints — 375 / 768 / 1024

**Decision**: Design against 375px as the primary/default layout (no media query needed
below it), with `min-width` breakpoints at 768px (tablet) and 1024px (desktop) widening
the container and switching the toolbar/form grid from stacked to side-by-side.

**Rationale**: Matches `ui-ux-pro-max`'s `mobile-first` + `breakpoint-consistency`
guidance (systematic breakpoints, e.g. 375/768/1024/1440) and the spec's explicit
"mayormente desde el celular" (mostly from the phone) framing. 375px is the narrowest
common modern phone viewport (iPhone SE class); FR-001 targets it directly.

**Alternatives considered**: A single fluid layout with no breakpoints — rejected because
the current `.grid2` (2-column form grid) and `.toolbar` (space-between row) both break
down below ~500px without an explicit stacked variant.

## Decision: Type scale and spacing scale

**Decision**: Type scale `12 / 14 / 16(base) / 18 / 24 / 32` (already close to what
exists — `h1` at 1.6rem≈26px, `h2` at 1.15rem≈18px — nudged onto the standard scale);
spacing on a 4/8px rhythm (already mostly followed informally — `padding: 9px 11px` etc.
get rounded onto 4/8 multiples).

**Rationale**: `ui-ux-pro-max`'s `font-scale` (`12 14 16 18 24 32`) and `spacing-scale`
(4pt/8dp increments) guidance directly, and FR-005 (one shared scale across all three
pages) needs a named scale to enforce rather than per-page eyeballed values.

**Alternatives considered**: None — this is a direct application of a standard,
well-established scale; no product-specific reason to deviate.

## Decision: Loading/error/empty states are inline component patterns, not a UI library

**Decision**: A small set of shared CSS classes/patterns (`.busy` state on buttons via
`disabled` + a spinner glyph, `.field-error` text under inputs, `.empty-state` block) built
directly into `globals.css` and used from the three pages' existing server-action wiring
(Next.js `useFormStatus`/`useActionState` where a client boundary is needed for pending
state — the smallest addition that gets real pending/error state without a new dependency).

**Rationale**: FR-002/FR-003/FR-004 need real interactivity (a button knows it's
"pending," a form knows it just failed) which Next.js Server Actions expose via
`useFormStatus`/`useActionState` in a small client component wrapper — no new library,
consistent with "Primary Dependencies: none added."

**Alternatives considered**: A toast library — rejected as unnecessary; inline
field-adjacent errors (per `ui-ux-pro-max`'s `error-placement`, `error-clarity`) are more
appropriate for a two-field form than a toast system, and avoid adding a dependency for
three screens.

## Decision: Remove `procesarCicloAction` entirely, not just hide the button

**Decision**: Delete `procesarCicloAction` from `web/app/actions.ts` along with its button
in `web/app/page.tsx`, rather than keeping the server action and only removing the UI
affordance.

**Rationale**: FR-007 requires the control be gone from residents' view; leaving unused
server-action code around after its only caller is deleted is exactly the kind of
half-finished/dead code the project's own conventions avoid. `/api/tick` (shipped) is now
the sole lifecycle driver, matching the spec's Assumptions.

**Alternatives considered**: Keep it behind an admin-only flag for manual ops override —
rejected as out of scope (no admin-role concept exists yet in the resident web app; adding
one is a separate, larger feature per `docs/ANALYSIS.md`'s V2 list).
