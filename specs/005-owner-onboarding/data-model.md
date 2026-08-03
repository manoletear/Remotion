# Data Model: Owner Onboarding via Admin Invitation

## `owner_invitations` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `resident_id` | uuid, references `residentes(id)` on delete cascade | The pending-claim RESIDENT row this invitation targets. |
| `token_hash` | text, unique, not null | `sha256(raw token)` — raw token never stored (research.md). |
| `channel_email` | text, null | Email address the invitation was sent to, if provided. |
| `channel_phone` | text, null | Phone (E.164) the invitation was sent to, if provided. At least one of `channel_email`/`channel_phone` is required (app-level check, mirrors the existing `assertRtuPassword`-style validators). |
| `status` | enum `owner_invitation_status`: `PENDING`, `CLAIMED`, `INVALIDATED` | No `EXPIRED` status — expiry is computed from `expires_at` at claim time (research.md). |
| `expires_at` | timestamptz, not null | `created_at + 7 days` (Assumptions). |
| `claimed_at` | timestamptz, null | Set atomically when `status` transitions to `CLAIMED`. |
| `claimed_by` | uuid, null, references `auth.users(id)` | The auth account that claimed it. |
| `invited_by` | uuid, not null, references `perfiles(id)` | The admin who created it — audit context beyond `eventos`. |
| `created_at` | timestamptz, not null, default `now()` | |

**Constraints**:
- `unique (resident_id) where status = 'PENDING'` — enforces "at most one valid claim link per
  pending owner" at the database level (research.md), independent of the invalidate-on-reinvite
  application logic.
- `check (channel_email is not null or channel_phone is not null)`.

## `residentes` (no schema change)

003 already gave this table everything an owner invitation needs: `tipo` (`RESIDENT` is the
value this feature creates), `telefono`, and the full RTU sync field set (`estado`,
`dispositivo_id`, `rtu_slot`, `sent_at`, `sync_attempts`, `last_error`, `removal_requested`).
This feature's only new behavior on this table is a new caller of the existing
`syncAddPermanent` — no new column.

## `perfiles` (no schema change)

The claim step performs the same insert an admin does today by hand:
`insert into perfiles (id, residente_id, rol) values (<auth.uid()>, <resident_id>, 'RESIDENT')`
— under service role, from the claim Server Action, per research.md's documented exception.

## Enums

```sql
create type owner_invitation_status as enum ('PENDING', 'CLAIMED', 'INVALIDATED');
```

`event_type` (existing enum) gains three values, added via `alter type ... add value` (the same
pattern migration 0005 already used for `RTU_SECURITY_RISK`):
- `OWNER_INVITED` — on invitation creation.
- `OWNER_INVITATION_CLAIMED` — on successful claim.
- `OWNER_INVITATION_INVALIDATED` — on invalidation-by-reinvite.

All three are appended to `eventos` with `entidad = 'RESIDENT'`, `entidad_id = resident_id` —
no new `entity_type` value needed, since every one of these events is fundamentally about a
resident record's onboarding state, exactly like `RESIDENT`-entidad `RTU_SYNC_*` events already
are.

## State Diagram — `owner_invitations.status`

```text
        create invitation
              │
              ▼
          [PENDING] ──── claim succeeds (token valid, unexpired) ────▶ [CLAIMED] (terminal)
              │
              ├──── admin re-invites the same resident ────▶ [INVALIDATED] (terminal)
              │
              └──── claim attempted after expires_at ────▶ rejected, status unchanged
                     (no stored EXPIRED state — see research.md)
```

## Repository Port

```ts
export interface NewOwnerInvitation {
  resident_id: string;
  channel_email: string | null;
  channel_phone: string | null;
  invited_by: string;
}

export interface OwnerInvitation {
  id: string;
  resident_id: string;
  token_hash: string;
  channel_email: string | null;
  channel_phone: string | null;
  status: "PENDING" | "CLAIMED" | "INVALIDATED";
  expires_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  invited_by: string;
  created_at: string;
}

export interface OwnerInvitationRepository {
  /** Creates the invitation, invalidating any prior PENDING one for the same resident_id in the same transaction. */
  create(input: NewOwnerInvitation, tokenHash: string, expiresAt: string): Promise<OwnerInvitation>;
  /** Looks up by token_hash — the only way this repository is ever queried by the claim flow. */
  findByTokenHash(tokenHash: string): Promise<OwnerInvitation | null>;
  /** Atomic conditional claim — see research.md. Returns null if the row wasn't PENDING and unexpired. */
  claim(id: string, claimedBy: string, now: string): Promise<OwnerInvitation | null>;
}
```
