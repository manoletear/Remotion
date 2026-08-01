# Contract: Admin RLS policies

The enforcement layer for this entire feature (FR-006) — not application code. This is
the exact SQL migration `0007_admin_dashboard.sql` must contain.

```sql
alter table perfiles add column condominio_id uuid references condominios (id) on delete set null;

create or replace function is_admin_for_condominio(target_condominio_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'ADMIN' and condominio_id = target_condominio_id
  );
$$;

create policy condominios_select_admin on condominios
  for select to authenticated using (id = (
    select condominio_id from perfiles where id = auth.uid() and rol = 'ADMIN'
  ));

create policy propiedades_select_admin on propiedades
  for select to authenticated using (is_admin_for_condominio(condominio_id));

create policy dispositivos_select_admin on dispositivos
  for select to authenticated using (is_admin_for_condominio(condominio_id));

create policy residentes_select_admin on residentes
  for select to authenticated using (
    exists (
      select 1 from propiedades pr
      where pr.id = residentes.propiedad_id and is_admin_for_condominio(pr.condominio_id)
    )
  );

create policy invitaciones_select_admin on invitaciones
  for select to authenticated using (
    exists (
      select 1 from propiedades pr
      where pr.id = invitaciones.propiedad_id and is_admin_for_condominio(pr.condominio_id)
    )
  );

create policy mascotas_select_admin on mascotas
  for select to authenticated using (
    exists (
      select 1 from propiedades pr
      where pr.id = mascotas.propiedad_id and is_admin_for_condominio(pr.condominio_id)
    )
  );

create policy eventos_select_admin on eventos
  for select to authenticated using (
    case entidad
      when 'INVITATION' then exists (
        select 1 from invitaciones i
        join propiedades pr on pr.id = i.propiedad_id
        where i.id = eventos.entidad_id and is_admin_for_condominio(pr.condominio_id)
      )
      when 'RESIDENT' then exists (
        select 1 from residentes r
        join propiedades pr on pr.id = r.propiedad_id
        where r.id = eventos.entidad_id and is_admin_for_condominio(pr.condominio_id)
      )
      when 'PROPERTY' then exists (
        select 1 from propiedades pr
        where pr.id = eventos.entidad_id and is_admin_for_condominio(pr.condominio_id)
      )
      when 'DEVICE' then exists (
        select 1 from dispositivos d
        where d.id = eventos.entidad_id and is_admin_for_condominio(d.condominio_id)
      )
      else false
    end
  );
```

## Provisioning an admin (manual, per spec Assumptions)

No UI for this yet (out of scope). An operator sets it directly:

```sql
update perfiles
set rol = 'ADMIN', condominio_id = '<condominio uuid>'
where id = '<auth.users uuid>';
```

The `auth.users` row must already exist (e.g. via the same magic-link login flow any
resident uses, or `auth.admin.createUser` as `scripts/seed.ts` already does) — this
migration only flips the role, it doesn't create the account.

## What this contract explicitly does NOT add

No INSERT/UPDATE/DELETE policy for the admin role on any table (FR-007) — an admin who
tries to write through the RLS-scoped session client gets denied exactly like an
unrelated resident would, because no permissive write policy exists for them.
