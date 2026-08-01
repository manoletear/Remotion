-- Admin dashboard (004): condominium-wide, read-only.
--
-- perfiles gains rol='ADMIN' as a valid value (already reserved — migration
-- 0004's own comment: "the seam for P1 admin roles ... just a new value +
-- extra policies") and a condominio_id column so an admin account can be
-- condo-scoped without also being a resident (an admin may administer a
-- condominium without living in it). Every policy below is SELECT-only and
-- purely additive — nothing existing is dropped or narrowed, unlike 003's
-- residentes policy fix. See contracts/admin-rls.md.

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

-- eventos.entidad_id is a bare uuid with no FK (references different tables
-- depending on `entidad`, the same polymorphism 003 worked through for
-- jobs) — branch per entity type to find which condominium it belongs to.
create policy eventos_select_admin on eventos
  for select to authenticated using (
    case entidad
      when 'CONDOMINIUM' then is_admin_for_condominio(eventos.entidad_id)
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
