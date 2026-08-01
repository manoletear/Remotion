# Data Model: Admin Dashboard (Condominium-Wide, Read-Only)

No new business entities — this feature is a read layer over data that already
exists. One schema change (`perfiles.condominio_id`) and one new SQL helper function.

## `perfiles` (existing table, extended)

```text
id            uuid primary key references auth.users(id)
residente_id  uuid references residentes(id)   -- existing, nullable
rol           text not null default 'RESIDENT' -- existing; 'ADMIN' is now a valid value
condominio_id uuid references condominios(id)  -- NEW, nullable
created_at    timestamptz not null default now()
```

An admin account: `rol = 'ADMIN'`, `condominio_id` set, `residente_id` left `null`
(unless the same person also happens to be a resident — spec Edge Cases covers this;
no special handling needed, their resident access and admin access are just both true
at once).

## `is_admin_for_condominio(uuid) returns boolean`

```sql
create or replace function is_admin_for_condominio(target_condominio_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'ADMIN' and condominio_id = target_condominio_id
  );
$$;
```

Same `stable`/`security definer`/pinned-`search_path` shape as the existing
`current_condominio_id()` et al. (migration 0004) — avoids RLS recursion the same way.

## RLS policies added (all SELECT-only, all additive — see contracts/admin-rls.md for
the exact SQL)

| Table | New policy | Scope check |
|---|---|---|
| `propiedades` | `propiedades_select_admin` | `is_admin_for_condominio(condominio_id)` |
| `residentes` | `residentes_select_admin` | via `propiedades.condominio_id` |
| `invitaciones` | `invitaciones_select_admin` | via `propiedades.condominio_id` |
| `mascotas` | `mascotas_select_admin` | via `propiedades.condominio_id` |
| `dispositivos` | `dispositivos_select_admin` | `is_admin_for_condominio(condominio_id)` (direct — dispositivos already has `condominio_id`) |
| `eventos` | `eventos_select_admin` | branches on `entidad` (research.md) |

`condominios` itself already has `condominios_select_own` (existing, via
`current_condominio_id()`) — an admin who is not also a resident of that condo has no
row satisfying that policy, so a matching `condominios_select_admin` policy
(`id = ` the admin's own `condominio_id`, no join needed) is added too, otherwise the
admin dashboard couldn't even read the condominium's own name.

## No changes to write policies

FR-007 (read-only) means none of `residentes_insert_own`/`invitaciones_insert_own`/
etc. (all existing, resident-scoped) are touched — an admin has no elevated write
access anywhere from this feature. If admin-provisioning is ever built (spec
Assumptions — explicitly out of scope here), it would add its own, separate write
policies at that time.
