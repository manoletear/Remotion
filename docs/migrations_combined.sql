-- Access Layer for GSM Gate Openers â€” core schema.
--
-- Mirrors src/domain and the enums in src/shared/enums.ts. The status/type
-- columns use Postgres enums so the database enforces the same vocabulary the
-- TypeScript layer does. Slot uniqueness per device guarantees a deterministic
-- RTU phonebook position for every active invitation.

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
-- Durable scheduler jobs, backing src/mcp/scheduler/supabase_scheduler.ts.
-- A worker/cron polls PENDING jobs whose run_at has passed, dispatches them via
-- the invitation_lifecycle tick, and marks them DONE.

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
-- RTU reconciler support: decouple command dispatch from confirmation.
--
-- The RTU answers over SMS asynchronously, so the lifecycle dispatches a command
-- (recording when, in `sent_at`) and confirms it later by reading the device's
-- reply. Inbound replies arrive via the Twilio webhook and are parked in
-- `inbound_sms`; the gateway's pollReply consumes the oldest matching one.

-- When the in-flight RTU command was dispatched (PENDING_SYNC / REMOVING). Used
-- to correlate the reply and to time the command out against the ack window.
alter table invitaciones add column sent_at timestamptz;

-- Inbound SMS replies from devices, written by the Twilio inbound webhook and
-- consumed (marked) by the reconciler when it confirms an in-flight command.
create table inbound_sms (
  id           uuid primary key default gen_random_uuid(),
  from_number  text not null,
  body         text not null,
  received_at  timestamptz not null default now(),
  consumed_at  timestamptz
);

-- Fast lookup of the oldest unconsumed reply from a given device since an instant.
create index inbound_sms_unconsumed_idx
  on inbound_sms (from_number, received_at)
  where consumed_at is null;
-- Auth + multi-tenant Row Level Security (P0-M1).
--
-- Links Supabase Auth users to residents via `perfiles`, then scopes every
-- business table to the acting resident's property/condominium with RLS. The
-- resident's web session (anon key) is thus DB-enforced to its own unit;
-- background work (the lifecycle tick, the inbound webhook) runs with the
-- service-role key, which bypasses RLS.
--
-- `perfiles.rol` defaults to 'RESIDENT' and is the seam for P1 admin roles
-- (no data migration needed there â€” just a new value + extra policies).

-- ---------------------------------------------------------------------------
-- Profiles: auth user <-> resident
-- ---------------------------------------------------------------------------
create table perfiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  residente_id  uuid references residentes (id) on delete set null,
  rol           text not null default 'RESIDENT',
  created_at    timestamptz not null default now()
);
create index perfiles_residente_idx on perfiles (residente_id);

-- ---------------------------------------------------------------------------
-- Scope helpers. SECURITY DEFINER so they read perfiles/residentes WITHOUT
-- triggering the policies below (avoids recursion); STABLE so the planner can
-- cache them per statement. search_path pinned for safety.
-- ---------------------------------------------------------------------------
create or replace function current_residente_id()
returns uuid language sql stable security definer set search_path = public as $$
  select residente_id from perfiles where id = auth.uid();
$$;

create or replace function current_propiedad_id()
returns uuid language sql stable security definer set search_path = public as $$
  select r.propiedad_id
  from perfiles p
  join residentes r on r.id = p.residente_id
  where p.id = auth.uid();
$$;

create or replace function current_condominio_id()
returns uuid language sql stable security definer set search_path = public as $$
  select pr.condominio_id
  from perfiles p
  join residentes r on r.id = p.residente_id
  join propiedades pr on pr.id = r.propiedad_id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. With RLS on and no permissive policy, a table is
-- closed to anon/authenticated and reachable only via the service role.
-- ---------------------------------------------------------------------------
alter table perfiles      enable row level security;
alter table condominios   enable row level security;
alter table propiedades   enable row level security;
alter table residentes    enable row level security;
alter table dispositivos  enable row level security;
alter table invitaciones  enable row level security;
alter table eventos       enable row level security;
alter table jobs          enable row level security;
alter table inbound_sms   enable row level security;

-- ---------------------------------------------------------------------------
-- Read policies (authenticated residents see only their own scope).
-- ---------------------------------------------------------------------------
create policy perfiles_select_self on perfiles
  for select to authenticated using (id = auth.uid());

create policy condominios_select_own on condominios
  for select to authenticated using (id = current_condominio_id());

create policy propiedades_select_own on propiedades
  for select to authenticated using (id = current_propiedad_id());

-- Co-residents of the same unit are visible; updates are restricted below.
create policy residentes_select_unit on residentes
  for select to authenticated using (propiedad_id = current_propiedad_id());

create policy dispositivos_select_condo on dispositivos
  for select to authenticated using (condominio_id = current_condominio_id());

create policy eventos_select_scope on eventos
  for select to authenticated using (
    entidad_id = current_propiedad_id()
    or entidad_id = current_residente_id()
    or entidad_id in (
      select id from invitaciones where propiedad_id = current_propiedad_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Resident-writable data.
-- ---------------------------------------------------------------------------
-- A resident may edit their own row (the updateResident skill).
create policy residentes_update_self on residentes
  for update to authenticated
  using (id = current_residente_id())
  with check (id = current_residente_id());

-- Invitations: full CRUD, always pinned to the resident's own property.
create policy invitaciones_select_own on invitaciones
  for select to authenticated using (propiedad_id = current_propiedad_id());

create policy invitaciones_insert_own on invitaciones
  for insert to authenticated with check (propiedad_id = current_propiedad_id());

create policy invitaciones_update_own on invitaciones
  for update to authenticated
  using (propiedad_id = current_propiedad_id())
  with check (propiedad_id = current_propiedad_id());

create policy invitaciones_delete_own on invitaciones
  for delete to authenticated using (propiedad_id = current_propiedad_id());

-- NOTE: `eventos`, `jobs` and `inbound_sms` have RLS enabled but NO write policy
-- for authenticated users on purpose. They are written by skills/worker running
-- under the service role (audit trail, scheduler, inbound webhook). Provisioning
-- (condominios/propiedades/dispositivos creation) is likewise service-role/admin
-- and gains resident-facing policies only with P1 roles.

-- ---------------------------------------------------------------------------
-- Linking auth users to residents (decision: admin-provisioned).
-- The deployment links a sign-up to its resident by inserting into `perfiles`
-- (e.g. an admin action or a one-time link step keyed by email/phone). A
-- handle_new_user() trigger can automate this later; left explicit for now so
-- the link is auditable and not guessed.
-- ---------------------------------------------------------------------------
-- Salvaged enrichment from the legacy Condogate model (P0).
--
-- The legacy app modeled extra visit context and lightweight user profiles that
-- the current schema dropped. Reintroduced here in our idiom (Spanish columns,
-- existing FKs) â€” NOT a port of the old tables, just the fields worth keeping:
--   * Invitation.guestReason  -> invitaciones.motivo
--   * Invitation.carPlate     -> invitaciones.patente
--   * Invitation.createdBy    -> invitaciones.creado_por  (FK residentes)
--   * User.familyName         -> residentes.apellido
--   * User.avatarUrl          -> residentes.avatar_url
--   * ActionStatus.SECURITY_RISK -> event_type 'RTU_SECURITY_RISK'
--
-- Everything else from Condogate (InvitationStatus, ActionType/ActionStatus,
-- AccessAction, AuditLog, User.role) is already covered by the current model
-- (state machine + jobs + sync fields + RtuOperation + eventos + perfiles.rol).

-- Invitation: visit context.
alter table invitaciones
  add column motivo      text,
  add column patente     text,
  add column creado_por  uuid references residentes (id) on delete set null;

-- Resident: profile fields (the legacy User.familyName / User.avatarUrl).
alter table residentes
  add column apellido    text,
  add column avatar_url  text;

-- Lets the reconciler flag an authorized number on the device that no active
-- invitation/resident explains (legacy ActionStatus.SECURITY_RISK), instead of
-- silently removing it. Audited, not auto-resolved.
alter type event_type add value if not exists 'RTU_SECURITY_RISK';
