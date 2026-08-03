-- Owner onboarding via admin invitation (005).
--
-- Replaces the manual "admin runs UPDATE perfiles by hand" step with a
-- self-service invite/claim flow. owner_invitations is a new table; residentes
-- and perfiles gain no columns (003 already gave residentes everything an
-- owner invitation needs to create). See data-model.md.

create type owner_invitation_status as enum ('PENDING', 'CLAIMED', 'INVALIDATED');

-- New event_type values for this feature's audit trail (Constitution IV),
-- mirroring 0005's precedent for adding a value to an existing enum.
alter type event_type add value if not exists 'OWNER_INVITED';
alter type event_type add value if not exists 'OWNER_INVITATION_CLAIMED';
alter type event_type add value if not exists 'OWNER_INVITATION_INVALIDATED';

create table owner_invitations (
  id             uuid primary key default gen_random_uuid(),
  resident_id    uuid not null references residentes (id) on delete cascade,
  token_hash     text not null unique,
  channel_email  text,
  channel_phone  text,
  status         owner_invitation_status not null default 'PENDING',
  expires_at     timestamptz not null,
  claimed_at     timestamptz,
  claimed_by     uuid references auth.users (id) on delete set null,
  invited_by     uuid not null references perfiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint owner_invitations_channel_check
    check (channel_email is not null or channel_phone is not null)
);
create index owner_invitations_resident_idx on owner_invitations (resident_id);
-- At most one valid (unclaimed) link per pending owner — enforced at the DB
-- level independent of the invalidate-on-reinvite application logic.
create unique index owner_invitations_one_pending_per_resident
  on owner_invitations (resident_id)
  where status = 'PENDING';

-- ---------------------------------------------------------------------------
-- residentes: admins need to INSERT a row for a property they administer,
-- not just their own (0006's residentes_insert_own is scoped to
-- current_propiedad_id(), which only ever matches a resident's own unit).
-- Same class of gap 0006 and 0008 each already found and fixed once.
-- ---------------------------------------------------------------------------
create policy residentes_insert_admin on residentes
  for insert to authenticated with check (
    exists (
      select 1 from propiedades pr
      where pr.id = residentes.propiedad_id and is_admin_for_condominio(pr.condominio_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: owner_invitations. Only an admin of the target property's own
-- condominium may create or list invitations; claiming one runs under
-- service role (research.md's documented exception — the claimant has no
-- perfiles row yet, so no RLS scope helper resolves for them), so no
-- resident-facing policy exists here at all.
-- ---------------------------------------------------------------------------
alter table owner_invitations enable row level security;

create policy owner_invitations_insert_admin on owner_invitations
  for insert to authenticated with check (
    exists (
      select 1 from residentes r
      join propiedades pr on pr.id = r.propiedad_id
      where r.id = owner_invitations.resident_id and is_admin_for_condominio(pr.condominio_id)
    )
  );

create policy owner_invitations_select_admin on owner_invitations
  for select to authenticated using (
    exists (
      select 1 from residentes r
      join propiedades pr on pr.id = r.propiedad_id
      where r.id = owner_invitations.resident_id and is_admin_for_condominio(pr.condominio_id)
    )
  );
