# Phase 0 Research: Owner Onboarding via Admin Invitation

## Decision: Claim token — random, stored hashed, never stored raw

**Decision**: Generate the claim token with `crypto.randomBytes(32).toString("base64url")`
(256 bits, URL-safe). Store only `sha256(token)` in `owner_invitations.token_hash`; the raw
token exists only in the URL sent to the owner and in the request that claims it — it is never
written to a column, a log line, or an `eventos.payload`.

**Rationale**: The token is a bearer secret functionally equivalent to a password-reset token.
A database read (backup, dump, compromised service-role key) must not hand over every
still-pending invitation's usable link. Hashing costs one `sha256` call on lookup and is the
same pattern password-reset and email-verification tokens use industry-wide.

**Alternatives considered**: Signed JWT embedding the resident id — rejected, adds a
dependency and a verification-key management concern for a value that's just a single-use
lookup key, not a credential that needs offline verification or claims. A short numeric code
(like the RTU's own SMS commands) — rejected, guessable within a feasible brute-force window
for something reachable over the open web with no rate limit yet specified.

## Decision: Single-use + expiry are enforced without a background job

**Decision**: `owner_invitations.status` is `PENDING | CLAIMED | INVALIDATED` (no `EXPIRED`
status). Expiry is a computed check (`expires_at < now()`) at the moment a claim is attempted,
not a state a scheduler transitions into. The claim itself is one atomic conditional update:
`update owner_invitations set status='CLAIMED' where id=$1 and status='PENDING' and
expires_at > now() returning *` — if zero rows come back, the claim is rejected (used, expired,
or invalidated are all indistinguishable failure paths to the caller, which is fine: the
spec's acceptance criteria only require each case to be rejected with a clear message, not a
different one per cause).

**Rationale**: Constitution III (dispatch/confirm decoupling, no blocking waits) exists
because the RTU replies asynchronously over SMS — nothing here waits on an external device, so
there's no tick/scheduler need. A conditional `UPDATE ... RETURNING` is the standard way to make
"first writer wins" atomic in Postgres without a row lock or a separate read-then-write race.

**Alternatives considered**: A cron sweep marking rows `EXPIRED` (mirrors the invitation
lifecycle's `tick`) — rejected as unnecessary complexity; nothing downstream needs to know an
invitation expired until someone tries to use it.

## Decision: Re-inviting invalidates the previous pending invitation

**Decision**: Creating a new owner invitation for a `residentes` row that already has a
`PENDING` invitation transitions that old row to `INVALIDATED` in the same transaction that
inserts the new one.

**Rationale**: Directly required by spec User Story 2, Scenario 3 — at most one valid link per
pending owner. A partial unique index (`unique (resident_id) where status = 'PENDING'`)
enforces this at the database level too, so it holds even if a future code path forgets the
invalidation step.

## Decision: Owner invitation delivery needs two new, real notification adapters

**Decision**: `NotificationPort` already anticipates `EMAIL` and `WHATSAPP` channels
(`src/mcp/notifications/port.ts`), but the only adapter that exists today —
`ConsoleNotifier` — is a no-op logger, used in **production** by both `makeServerContext` and
`makeSystemContext`. Nothing sent through `ctx.notifier` today actually reaches anyone; it is a
designed seam with no real adapter behind it yet. This feature is the first for which delivery
is not best-effort UX polish (unlike `notifyVisitor`, where the underlying access state is
already correct regardless of whether the ping arrives) — an invitation that silently fails to
send fails the feature outright (FR-004, SC-003). Two real adapters are needed:

- **SMS**: add `"SMS"` to `NotificationChannel` (today: `PUSH | WHATSAPP | EMAIL`) and a new
  `TwilioNotifier` that calls the Twilio Messages API directly for plain SMS. This is
  deliberately **not** a reuse of `TwilioSmsGateway` — that adapter exists for RTU control
  traffic (dispatch + inbound-poll wiring for phonebook commands) and the port docstring is
  explicit that notifications are a distinct concern from SMS-to-hardware. Same account/number,
  separate code path.
- **Email**: no email-sending capability exists anywhere in this stack today (Supabase Auth's
  own emails are for its own OTP/magic-link flow, not free-form content). Add a small
  `ResendNotifier` (fetch-based, no SDK, consistent with this repo's Twilio-via-fetch
  convention) gated behind an optional `RESEND_API_KEY` env var. If unset, email silently
  degrades to a `ConsoleNotifier`-style log — the invitation still goes out over SMS if a phone
  was provided, satisfying "at least one channel" (Assumptions).

**Rationale**: Keeps the RTU-vs-human-notification boundary the constitution already draws
intact, and doesn't block this feature on the user creating a Resend account before day one —
but it does mean **email delivery requires that account to be created and its API key set**
before it does anything beyond logging. Flagged explicitly for the user, not silently assumed.

**Alternatives considered**: Route email through Supabase's `auth.admin.generateLink` — rejected,
it's designed to carry Supabase's own auth templates/content, not an arbitrary "you've been
invited to manage Casa 5" message with a non-auth claim link.

## Decision: No enumeration leak on invite creation

**Decision**: Before creating a new pending resident + invitation, the invite skill checks
(service-role, not exposed to the caller) whether the given phone/email already resolves to an
existing `auth.users` row. If it does, the skill still returns the same generic success result
to the admin ("invitación enviada") but does not create a duplicate resident/invitation — it is
a silent no-op from the admin's point of view.

**Rationale**: Directly required by FR-012 and the spec's first Edge Case. Returning a
different message ("ya existe una cuenta con ese contacto") would let an admin enumerate
accounts across condominiums by trial and error.

**Alternatives considered**: Reject with a distinct error — rejected for the enumeration reason
above.

## Decision: RESIDENT-row gate access is granted at invite time, not claim time

**Decision**: `inviteOwner` creates the `residentes` row (tipo `RESIDENT`) and calls the
existing `syncAddPermanent` (from `permanent_access_sync.ts`, built in 003) immediately — the
owner's phone gets real RTU phonebook access as soon as the admin invites them, independent of
whether or when they ever complete the web claim.

**Rationale**: Matches how `addFamilyMember`/`addEmployee` already behave (real access granted
on creation, not on some later confirmation step) — gate access and portal-login access are two
different capabilities riding the same `residentes` row, and conflating them (e.g., withholding
gate access until the web claim completes) would be a new, undiscussed product behavior beyond
this feature's actual scope.

**Alternatives considered**: Defer RTU sync until claim — rejected, no such gating exists
anywhere else in this system and the spec never asks for it.

## Decision: Claim route is a documented service-role exception to Constitution V

**Decision**: `/reclamar/[token]`'s Server Action runs under the service-role client, not the
session client — the caller has no `perfiles` row yet, so none of the existing RLS scope
helpers (`current_propiedad_id()` etc.) resolve for them. The action re-derives every scope
fact itself server-side (token → invitation row → resident row → `propiedad_id`) rather than
trusting anything from the client beyond the opaque token, then performs the `perfiles` insert
under service role.

**Rationale**: This is the exact same shape as the admin-provisioned link this feature
replaces (already done via a service-role `UPDATE perfiles` run by hand) — moving that from a
human running SQL to a Server Action doesn't change its trust boundary, just who/what operates
it. Constitution V's actual concern (a resident's session client reading another tenant's rows)
isn't implicated: there is no session client involved in this step at all.

## Decision: Contact Picker API usage (User Story 3)

**Decision**: Feature-detect with `"contacts" in navigator && "ContactsManager" in window`
before rendering the "elegir de contactos" button at all — on unsupported browsers the button
is simply absent, never shown-then-broken. When present, call
`navigator.contacts.select(["tel", "name"], { multiple: false })` and fill the form's name/phone
fields from the result.

**Rationale**: Directly satisfies FR-011. This API is genuinely Android Chrome-only as of this
writing (no polyfill exists for other engines); the spec already accepts manual entry as the
universal fallback.

**Alternatives considered**: A generic "share/import" flow via the OS share sheet — rejected,
more indirection for the same one-tap goal the Contact Picker already provides where supported.
