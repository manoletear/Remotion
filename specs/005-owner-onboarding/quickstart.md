# Quickstart: Owner Onboarding via Admin Invitation

## Prerequisites

- Migration `0009_owner_invitations.sql` applied.
- An admin account provisioned (per 004's quickstart) — logged into `/admin`.
- `RESEND_API_KEY` set if email delivery is being validated (optional — SMS works with the
  Twilio credentials already configured; see research.md).

## Section 1 — User Story 1: invite and claim (P1, MVP)

1. As the admin, go to `/admin/propiedades`, pick a property with no `RESIDENT`-tipo row yet,
   and use "Invitar propietario" with a real phone number you control.
2. Confirm an SMS arrives with a `condogate-ten.vercel.app/reclamar/<token>` link.
3. Open the link on a device with no existing session. Confirm the login form appears (not an
   error) and the token survives through to after authentication.
4. Authenticate (magic link / OTP as usual).
5. Confirm you land in `/` (resident dashboard) with no extra confirmation screen, and that
   `/perfil`, `/historial`, `/invitar` all work exactly as they do for any other resident.
6. In Supabase, confirm: the `residentes` row's `estado` progressed toward `ACTIVE` (via the
   existing `syncAddPermanent`/tick cycle, unrelated to this feature), the `owner_invitations`
   row is `CLAIMED`, and a `perfiles` row now links your auth user to that resident — with no
   manual SQL run for this account.

## Section 2 — User Story 2: claim link safety

1. After Section 1, open the same `/reclamar/<token>` link again. Confirm: "Este enlace ya fue
   usado." — and confirm in Supabase that no second `perfiles` row or resident was created.
2. Create a second invitation, note its token, then invite the *same* pending resident again
   before claiming the first. Confirm the first token now shows "Este enlace no es válido"
   (invalidated) and only the newest one works.
3. (Optional, requires patience or a manual `expires_at` edit in SQL) Confirm a token past its
   expiration window shows "Este enlace expiró..." and does not create a `perfiles` row.

## Section 3 — User Story 3: Contact Picker

1. Open `/admin/propiedades`'s invite form on Android Chrome (mobile). Confirm "elegir de
   contactos" appears and picking a contact fills name/phone.
2. Open the same form on desktop Chrome/Firefox/Safari or iOS Safari. Confirm the button is
   simply absent (not present-but-broken) and manual entry works normally.

## Section 4 — boundary checks that matter most

1. Confirm a non-admin resident account cannot reach any invite-creation path (no UI
   entry point, and the underlying action rejects if attempted directly).
2. Confirm inviting a phone/email that already has an account anywhere in the system returns
   the same "invitación enviada" success message an admin would see for a brand-new contact —
   no different message, no way to tell the two cases apart from the admin's side (FR-012).
