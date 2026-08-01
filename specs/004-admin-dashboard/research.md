# Research: Admin Dashboard (Condominium-Wide, Read-Only)

No `[NEEDS CLARIFICATION]` markers were left in the spec — both open questions
("familias de paso", admin scope) were resolved with the user before drafting.

## Decision: `perfiles.condominio_id`, not reusing `current_condominio_id()`

**Decision**: Add a new nullable `condominio_id` column directly on `perfiles`, rather
than trying to derive an admin's condominium through the existing
`current_condominio_id()` helper (which joins `perfiles → residentes → propiedades →
condominios`).

**Rationale**: That join chain requires `perfiles.residente_id` to be set — i.e. it
only works for an account that is *also* a resident. Per spec Assumptions, an admin
account is provisioned the same manual way the one resident account was, and there's
no reason to force every admin to also be a fake resident row just to have a
condominium association. A direct `condominio_id` column is the simplest correct model
for "this account administers this condominium," independent of whether it's also
someone's resident login.

**Alternatives considered**: Require every admin to have a `residente_id` too (reusing
the existing helper unchanged) — rejected as a modeling hack (an admin is not
necessarily a resident) that would also break the moment a condominium needs an admin
who lives nowhere in it (e.g. a property management company employee).

## Decision: `is_admin_for_condominio()` as a `security definer` SQL function

**Decision**: `is_admin_for_condominio(target_condominio_id uuid) returns boolean`,
`security definer`, `stable`, `search_path = public` — the exact same shape as the
existing `current_condominio_id()`/`current_residente_id()`/`current_propiedad_id()`
helpers in migration 0004.

**Rationale**: Consistency with the established pattern (avoids RLS recursion the same
way the existing helpers already do, for the same reason — reading `perfiles` from
inside a policy on `perfiles` itself would otherwise recurse). No reason to invent a
different mechanism for the same class of problem.

**Alternatives considered**: Inline the `exists (select 1 from perfiles where ...)`
subquery directly in every policy instead of a shared function — rejected, it's
exactly the kind of repeated logic a shared helper exists to avoid, and the existing
helpers already establish that convention.

## Decision: `eventos`'s admin policy branches on `entidad` (polymorphic)

**Decision**: The admin SELECT policy on `eventos` uses a `case entidad when ... then
exists(...) ...` expression — one `exists` branch per `EntityType` that can plausibly
appear (`INVITATION`, `RESIDENT`, `PROPERTY`, `DEVICE`), each joining back to
`propiedades`/`dispositivos` to reach a `condominio_id` to check against
`is_admin_for_condominio()`.

**Rationale**: `eventos.entidad_id` is a bare uuid with no FK (by design, since it
references different tables depending on `entidad` — the same polymorphism `003`
already worked through for `jobs`). There is no single join that resolves "what
condominium does this event belong to" without knowing which table `entidad_id` points
into first.

**Alternatives considered**: Add a denormalized `condominio_id` column directly on
`eventos`, set at insert time — would simplify the RLS policy to a single equality
check, but requires touching every `auditEvent(...)` call site (there are many, across
`001`/`002`/`003`) to populate it, for a benefit (a simpler read-only policy) that
doesn't justify that blast radius. The `case`-based policy is more SQL but zero
application-code changes.

## Decision: SaaS shell (sidebar + stat cards) via plain CSS, no component library

**Decision**: Per the user's explicit "estilo SaaS" direction: a fixed left sidebar
(nav: Resumen, Bitácora, Propiedades, Invitaciones), a top area with stat cards
(counts), and data tables below — built with new CSS classes in the existing
`globals.css` (extending `002`'s token system: same color/spacing/type tokens, new
layout primitives for the sidebar shell and stat cards), not a new UI dependency.

**Rationale**: Matches the project's established pattern (no new dependency for
something achievable with the existing plain-CSS approach — same call `002` made for
its whole design system, and `001` made for HMAC/signature verification). The
resident portal is deliberately mobile-first/circular-button (SafeCard-inspired); the
admin dashboard is deliberately desktop-first/data-dense (conventional SaaS admin
pattern) — different information needs, different layout, same token vocabulary
underneath so the whole product still reads as one system (Constitution-adjacent:
visual consistency was `002`'s explicit goal for the *resident-facing* surface; the
admin surface is a new, separate surface with its own appropriate conventions, not a
mismatch).

**Alternatives considered**: Reuse the resident portal's mobile-first
`.container`/`.panel` layout as-is for admin too — rejected per the user's explicit
ask for a distinct SaaS style, and because a dense multi-property data table
genuinely doesn't fit a narrow mobile-first container well.
