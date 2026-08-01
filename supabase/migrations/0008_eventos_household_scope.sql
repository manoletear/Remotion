-- Fix eventos_select_scope (0004) to cover the whole household, not just the
-- logged-in resident's own row.
--
-- `entidad_id = current_residente_id()` only ever matches the ONE residente
-- row the logged-in user is linked to via `perfiles`. Since 003 added family
-- members and employees as their own `residentes` rows (tipo FAMILIAR /
-- EMPLEADO), their RTU_SYNC_* events carry entidad='RESIDENT' with entidad_id
-- = *their* row, not the logged-in resident's — the old policy silently hid
-- them. Same class of bug as 001's eventos-insert gap and 003's residentes
-- RLS gap: caught before building the "historial de entradas y salidas" view
-- that depends on seeing every household member's events, not just the
-- account holder's.
drop policy eventos_select_scope on eventos;

create policy eventos_select_scope on eventos
  for select to authenticated using (
    entidad_id = current_propiedad_id()
    or entidad_id in (select id from residentes where propiedad_id = current_propiedad_id())
    or entidad_id in (select id from invitaciones where propiedad_id = current_propiedad_id())
  );
