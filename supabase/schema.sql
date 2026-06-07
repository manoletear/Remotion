-- =============================================================================
-- Access Layer for GSM Gate Openers — CONSOLIDATED SCHEMA (apply-all)
-- =============================================================================
-- Full schema in one file, for when the Supabase project is finally created.
-- It is the concatenation, in order, of:
--   supabase/migrations/0001_access_layer_core.sql
--   supabase/migrations/0002_scheduler_jobs.sql
-- Those numbered migrations remain the SOURCE OF TRUTH for incremental changes;
-- this file is a convenience to bootstrap a fresh database in a single pass
-- (paste into the Supabase SQL editor, or apply via the MCP).
--
-- Safe to run once on an empty project. Re-running will fail on existing types
-- (create type ...) — that is expected; use the numbered migrations for changes.
--
-- NOTE: Auth/RLS (perfiles + policies) and inbound_sms are P0 follow-ups and
-- will arrive as migrations 0003/0004 — see docs/plan-p0.md. They are NOT here
-- yet because the database has no auth.users until the project exists.
-- =============================================================================


-- #############################################################################
-- 0001 — CORE SCHEMA (domain tables, enums, slot uniqueness)
-- #############################################################################

-- Required for gen_random_uuid() on older Postgres; a no-op where it is built in.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type condominium_status as enum ('ACTIVE', 'SUSPENDED');

create type device_type as enum ('RTU5024');

create type device_status as enum ('ONLINE', 'OFFLINE', 'UNKNOWN');

create type invitation_status as enum (
  'CREATED', 'PENDING_SYNC', 'ACTIVE', 'EXPIRED', 'REMOVING', 'REMOVED', 'ERROR'
);

create type entity_type as enum (
  'CONDOMINIUM', 'PROPERTY', 'RESIDENT', 'DEVICE', 'INVITATION'
);

create type event_type as enum (
  'INVITATION_CREATED', 'INVITATION_UPDATED', 'INVITATION_CANCELLED',
  'INVITATION_ACTIVATED', 'INVITATION_EXPIRED',
  'RTU_SYNC_STARTED', 'RTU_SYNC_SUCCESS', 'RTU_SYNC_FAILED',
  'USER_CREATED', 'USER_UPDATED', 'PROPERTY_CREATED', 'DEVICE_REGISTERED'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table condominios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  estado      condominium_status not null default 'ACTIVE',
  created_at  timestamptz not null default now()
);

create table propiedades (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominios (id) on delete cascade,
  numero        text not null,
  created_at    timestamptz not null default now(),
  unique (condominio_id, numero)
);
create index propiedades_condominio_idx on propiedades (condominio_id);

create table residentes (
  id            uuid primary key default gen_random_uuid(),
  propiedad_id  uuid not null references propiedades (id) on delete cascade,
  nombre        text not null,
  telefono      text not null,
  created_at    timestamptz not null default now()
);
create index residentes_propiedad_idx on residentes (propiedad_id);

create table dispositivos (
  id            uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references condominios (id) on delete cascade,
  tipo          device_type not null default 'RTU5024',
  numero_sim    text not null,
  estado        device_status not null default 'UNKNOWN',
  -- No default: each device's command password must be supplied explicitly at
  -- provisioning time (avoids a shared weak default in the DB).
  password      text not null,
  created_at    timestamptz not null default now()
);
create index dispositivos_condominio_idx on dispositivos (condominio_id);

create table invitaciones (
  id                  uuid primary key default gen_random_uuid(),
  propiedad_id        uuid not null references propiedades (id) on delete cascade,
  visitante_nombre    text not null,
  visitante_telefono  text not null,
  fecha_inicio        timestamptz not null,
  fecha_fin           timestamptz not null,
  estado              invitation_status not null default 'CREATED',
  cancelled           boolean not null default false,
  -- Device the access is loaded on while ACTIVE; set together with rtu_slot and
  -- cleared on removal. Lets the DB enforce per-device slot uniqueness.
  dispositivo_id      uuid references dispositivos (id) on delete set null,
  rtu_slot            integer,
  sync_attempts       integer not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invitaciones_window_check check (fecha_inicio < fecha_fin)
);
create index invitaciones_propiedad_idx on invitaciones (propiedad_id);
create index invitaciones_estado_idx on invitaciones (estado);
-- A phonebook slot can be held by at most one invitation per device at a time.
create unique index invitaciones_device_slot_unique
  on invitaciones (dispositivo_id, rtu_slot)
  where rtu_slot is not null;

create table eventos (
  id          uuid primary key default gen_random_uuid(),
  tipo        event_type not null,
  entidad     entity_type not null,
  entidad_id  uuid not null,
  payload     jsonb not null default '{}'::jsonb,
  fecha       timestamptz not null default now()
);
create index eventos_entidad_idx on eventos (entidad_id, fecha desc);

-- Keep updated_at fresh on every invitation write.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger invitaciones_set_updated_at
  before update on invitaciones
  for each row execute function set_updated_at();


-- #############################################################################
-- 0002 — SCHEDULER JOBS (durable timers for the lifecycle worker)
-- #############################################################################

create type job_kind as enum ('ACTIVATION', 'EXPIRATION', 'RETRY');
create type job_status as enum ('PENDING', 'DONE');

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          job_kind not null,
  invitation_id uuid not null references invitaciones (id) on delete cascade,
  run_at        timestamptz not null,
  status        job_status not null default 'PENDING',
  created_at    timestamptz not null default now()
);

-- Fast lookup of due work.
create index jobs_due_idx on jobs (status, run_at);

-- At most one pending job of each kind per invitation (matches the adapter's
-- replace-on-reschedule semantics and prevents duplicate activations).
create unique index jobs_pending_unique
  on jobs (invitation_id, kind)
  where status = 'PENDING';

-- =============================================================================
-- END OF CONSOLIDATED SCHEMA
-- =============================================================================
