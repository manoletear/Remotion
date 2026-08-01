# Quickstart: Validating the Admin Dashboard

Prerequisites: migration `0007_admin_dashboard.sql` applied; at least two properties
with some residents/family/employees/invitations seeded (to actually see
cross-property data, not just one unit); an admin account provisioned per
contracts/admin-rls.md's manual `update perfiles` step.

## 1. Admin sees cross-property data (US1-US3, FR-002-FR-004)

1. Log in as the admin account, go to `/admin`.
2. Confirm the overview shows stat cards (properties, active family/employees,
   active invitations) with non-zero counts spanning more than one property.
3. Go to `/admin/bitacora` — confirm events from more than one property appear, each
   labeled with its property.
4. Go to `/admin/propiedades` — confirm every property's household (residents, family,
   employees) is listed with status.
5. Go to `/admin/invitaciones` — confirm every property's invitations appear.

## 2. Resident isolation is unchanged (FR-005, SC-004)

1. Log in as a plain resident (not admin).
2. Confirm `/admin` (and its sub-routes) are unreachable — either redirected or
   showing no data (RLS returns empty, not an error) — and that `/`/`/perfil` still
   only show that resident's own property, exactly as before this feature.

## 3. RLS is the actual enforcement (FR-006)

1. Using the resident's own session token directly against the Supabase REST API
   (bypassing the Next.js UI entirely — e.g. `curl` with the resident's `apikey`/
   `Authorization` against `/rest/v1/propiedades`), confirm only their own property
   row is returned, never another one — proving the boundary is in Postgres, not just
   hidden by the app's navigation.

## Out of scope for this quickstart

Provisioning admins or properties from a UI — still manual (seed script / direct SQL),
per spec Assumptions.
