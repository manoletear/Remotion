-- Household profile & permanent access (003).
--
-- Residentes gains a `tipo` discriminator so a property can have more than one
-- permanent access-holder (family members, domestic employees) beyond the one
-- admin-seeded resident who logs in — plus the same RTU sync fields
-- invitaciones already has, since permanent access now needs the same
-- dispatch/confirm tracking. Mascotas is a pure household record with zero
-- device interaction. `jobs.invitation_id` becomes a polymorphic
-- `entity_type` + `entity_id` pair so a permanent-access RETRY job can be
-- scheduled the same way an invitation's already can (mirrors eventos'
-- `entidad` + `entidad_id` pair, not just entidad_id alone).

-- ---------------------------------------------------------------------------
-- residentes: tipo discriminator + RTU sync fields
-- ---------------------------------------------------------------------------
create type resident_tipo as enum ('RESIDENT', 'FAMILIAR', 'EMPLEADO');

create type resident_status as enum (
  'PENDING_SYNC', 'ACTIVE', 'REMOVING', 'REMOVED', 'ERROR'
);

alter table residentes
  add column tipo               resident_tipo   not null default 'RESIDENT',
  add column rut                 text           null,
  add column patente             text           null,
  add column estado              resident_status not null default 'ACTIVE',
  add column dispositivo_id      uuid           references dispositivos (id) on delete set null,
  add column rtu_slot            integer,
  add column sent_at             timestamptz,
  add column sync_attempts       integer        not null default 0,
  add column last_error          text,
  -- Mirrors invitaciones.cancelled's role: disambiguates retry intent after a
  -- sync failure lands in ERROR (from either an add or a remove attempt) —
  -- without it, a retry can't tell whether it should re-drive toward ACTIVE
  -- or toward REMOVED.
  add column removal_requested   boolean        not null default false;

-- A phonebook slot can be held by at most one resident per device at a time —
-- the same guarantee invitaciones_device_slot_unique already gives invitations.
create unique index residentes_device_slot_unique
  on residentes (dispositivo_id, rtu_slot)
  where rtu_slot is not null;

-- ---------------------------------------------------------------------------
-- mascotas: informational only, no device interaction, no sync fields.
-- ---------------------------------------------------------------------------
create table mascotas (
  id           uuid primary key default gen_random_uuid(),
  propiedad_id uuid not null references propiedades (id) on delete cascade,
  nombre       text not null,
  foto_path    text,
  created_at   timestamptz not null default now()
);
create index mascotas_propiedad_idx on mascotas (propiedad_id);

-- ---------------------------------------------------------------------------
-- jobs: invitation_id -> entity_id + entity_type (polymorphic, mirrors
-- eventos' actual shape — entidad + entidad_id together, not a bare uuid
-- alone; an earlier draft of this migration missed that eventos already
-- pairs a type column with its id column, and RETRY jobs need that same
-- discrimination since both invitations and residents can now have one).
-- Existing ACTIVATION/EXPIRATION rows are invitation-only by construction, so
-- backfilling entity_type = 'INVITATION' for every existing row is correct.
-- ---------------------------------------------------------------------------
create type job_entity_type as enum ('INVITATION', 'RESIDENT');

alter table jobs drop constraint jobs_invitation_id_fkey;
alter table jobs rename column invitation_id to entity_id;
alter table jobs add column entity_type job_entity_type not null default 'INVITATION';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table mascotas enable row level security;

create policy mascotas_select_own on mascotas
  for select to authenticated using (propiedad_id = current_propiedad_id());

create policy mascotas_insert_own on mascotas
  for insert to authenticated with check (propiedad_id = current_propiedad_id());

create policy mascotas_delete_own on mascotas
  for delete to authenticated using (propiedad_id = current_propiedad_id());

-- residentes previously allowed only inserting nothing (no policy) and
-- updating one's own row (id = current_residente_id()). This feature needs a
-- resident to insert/update/delete OTHER rows on their own property (family
-- members, employees) — the same property-scoped shape invitaciones already
-- has. Replace the too-narrow update policy; add insert/delete.
drop policy residentes_update_self on residentes;

create policy residentes_insert_own on residentes
  for insert to authenticated with check (propiedad_id = current_propiedad_id());

create policy residentes_update_own on residentes
  for update to authenticated
  using (propiedad_id = current_propiedad_id())
  with check (propiedad_id = current_propiedad_id());

create policy residentes_delete_own on residentes
  for delete to authenticated using (propiedad_id = current_propiedad_id());

-- ---------------------------------------------------------------------------
-- Storage: mascotas-fotos bucket. The upload route writes via the
-- service-role client (research.md — server-side proxy, not direct
-- client->Storage), so these policies aren't on the write path today, but are
-- added now anyway for defense-in-depth (Constitution V: RLS is the
-- authority, not just application logic) and to allow a future direct-read
-- path without a schema change. Objects are keyed "{propiedad_id}/...".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mascotas-fotos', 'mascotas-fotos', false)
on conflict (id) do nothing;

create policy mascotas_fotos_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'mascotas-fotos'
    and (storage.foldername(name))[1] = current_propiedad_id()::text
  );

create policy mascotas_fotos_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'mascotas-fotos'
    and (storage.foldername(name))[1] = current_propiedad_id()::text
  );

create policy mascotas_fotos_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'mascotas-fotos'
    and (storage.foldername(name))[1] = current_propiedad_id()::text
  );
