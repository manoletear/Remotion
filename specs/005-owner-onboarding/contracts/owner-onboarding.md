# Contracts: Owner Onboarding via Admin Invitation

This project's "contracts" are skill function signatures (the domain package's public
interface) plus the one new public HTTP surface (the claim page) — there is no separate API
service in this repo.

## `inviteOwner` (new skill, `src/skills/onboarding/invite_owner.ts`)

```ts
interface InviteOwnerInput {
  propiedad_id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

async function inviteOwner(
  ctx: SkillContext,
  invitedBy: string,   // perfiles.id of the acting admin
  input: InviteOwnerInput,
): Promise<{ invitationId: string } | { skipped: true }>;
```

- Caller MUST already be authorized as an admin for `input.propiedad_id`'s condominium — this
  skill does not re-check that itself (mirrors every other skill's pattern: the web layer's
  `getCurrentAdmin()` plus RLS are the enforcement points, not the skill).
- Requires `telefono` or `email` (or both) — throws `ValidationError` if neither is given.
- Returns `{ skipped: true }` (not an error) if the contact already resolves to an existing
  `auth.users` account — see research.md's no-enumeration-leak decision. The web layer must
  render the identical success UI for both return shapes.
- On the normal path: creates the `residentes` row (tipo `RESIDENT`, estado `PENDING_SYNC`),
  calls `syncAddPermanent` (from 003, unchanged), creates the `owner_invitations` row
  (invalidating any prior `PENDING` one for that resident), sends the invitation via whichever
  notifier channel(s) apply, and appends an `OWNER_INVITED` event.

## `claimInvitation` (new skill, `src/skills/onboarding/claim_invitation.ts`)

```ts
async function claimInvitation(
  ctx: SkillContext,   // service-role context — see research.md
  rawToken: string,
  claimedByAuthUserId: string,
): Promise<{ residentId: string; propiedadId: string } | { error: "not_found" | "expired" | "already_used" }>;
```

- Hashes `rawToken`, looks up by `token_hash`.
- Not found → `{ error: "not_found" }`.
- Found but `expires_at` in the past → `{ error: "expired" }` (status left as-is, per
  research.md — no separate EXPIRED state).
- Found, unexpired, but `status !== 'PENDING'` (already `CLAIMED` or `INVALIDATED`) →
  `{ error: "already_used" }`.
- Otherwise: atomically claims (conditional update), inserts the `perfiles` row linking
  `claimedByAuthUserId` to the invitation's `resident_id`, appends
  `OWNER_INVITATION_CLAIMED`, and returns the resident/property so the caller can redirect into
  the resident portal.

## Web surface: `GET /reclamar/[token]`

A public page (added to `middleware.ts`'s `PUBLIC_PATHS`, same treatment as `/login`).

| State | Trigger | What the owner sees |
|---|---|---|
| Not yet authenticated | No Supabase session | The existing magic-link/OTP login form, with the token carried through (e.g. a hidden field / redirect param) so the claim runs immediately after auth succeeds. |
| Authenticated, token valid | Session exists, `claimInvitation` succeeds | Redirect straight into `/` (resident dashboard) — no extra confirmation screen; FR-007 says "no further admin action," and no extra owner-facing step is specified either. |
| Token not found | `claimInvitation` → `not_found` | "Este enlace no es válido." |
| Token expired | `claimInvitation` → `expired` | "Este enlace expiró. Pídele al administrador una nueva invitación." (spec User Story 2, Scenario 2 — distinct, actionable message). |
| Token already used | `claimInvitation` → `already_used` | "Este enlace ya fue usado." (spec User Story 2, Scenario 1 — distinct message). |
