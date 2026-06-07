-- Auth + multi-tenant Row Level Security (P0-M1).
--
-- Links Supabase Auth users to residents via `perfiles`, then scopes every
-- business table to the acting resident's property/condominium with RLS. The
-- resident's web session (anon key) is thus DB-enforced to its own unit;
-- background work (the lifecycle tick, the inbound webhook) runs with the
-- service-role key, which bypasses RLS.
--
-- `perfiles.rol` defaults to 'RESIDENT' and is the seam for P1 admin roles
-- (no data migration needed there — just a new value + extra policies).

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
