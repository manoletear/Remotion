# Data Model: Household Profile & Permanent Access

## `residentes` (existing table, extended)

Current shape (`src/domain/resident/index.ts`):

```text
id, propiedad_id, nombre, telefono, apellido, avatar_url, created_at
```

New columns (migration `0006`):

```text
tipo             resident_tipo   not null default 'RESIDENT'   -- RESIDENT | FAMILIAR | EMPLEADO
rut              text            null    -- EMPLEADO only; normalized "XXXXXXXX-X"
patente          text            null    -- EMPLEADO only; informational, no device tie
estado           resident_status not null default 'ACTIVE'     -- see below
dispositivo_id   uuid            null references dispositivos(id) on delete set null
rtu_slot         integer         null    -- 1-99, unique per (dispositivo_id, rtu_slot)
                                             across BOTH residentes and invitaciones —
                                             see "Slot uniqueness" below
sent_at          timestamptz     null
sync_attempts    integer         not null default 0
last_error       text            null
```

New enum `resident_tipo`: `RESIDENT | FAMILIAR | EMPLEADO`. The row created by
`scripts/seed.ts` (today's only path to a resident) becomes `tipo = 'RESIDENT'`
implicitly — no migration of existing rows needed beyond the column default.

New enum `resident_status`: `PENDING_SYNC | ACTIVE | REMOVING | REMOVED | ERROR` — the
same vocabulary as `invitation_status` **minus** `CREATED` and `EXPIRED` (no
"not yet scheduled" state, since dispatch is immediate on add; no expiration, since
this access has none). State machine:

```text
PENDING_SYNC ─► ACTIVE ─► REMOVING ─► REMOVED
     │                                  ▲
     └──────────────────────────────────┘ (cancelled before ever confirming)
ERROR ◄── (any sync failure; retried back to PENDING_SYNC/REMOVING)
```

The existing `RESIDENT` row created by `scripts/seed.ts` is a special case: it
represents the admin-provisioned primary resident, whose RTU sync (if any) already
happened outside this feature's flow at provisioning time. This feature's states apply
to `FAMILIAR`/`EMPLEADO` rows added through it; a plain `RESIDENT` row's `estado`
defaults to `ACTIVE` with no slot tracked, preserving today's seed behavior unchanged
(FR-001-FR-012 are scoped to family/employee, not to redefining how the primary
resident is provisioned).

### Slot uniqueness

The existing partial unique index `invitaciones_device_slot_unique` on
`(dispositivo_id, rtu_slot) where rtu_slot is not null` only covers `invitaciones`.
Migration `0006` adds the equivalent for `residentes`:
`residentes_device_slot_unique on residentes (dispositivo_id, rtu_slot) where rtu_slot
is not null`. Because the two tables use disjoint slot ranges (1-99 vs. 100-200,
enforced in application code per research.md, not by a cross-table DB constraint), two
separate per-table unique indexes are sufficient — no cross-table constraint is needed.

## `mascotas` (new table)

```text
id           uuid primary key default gen_random_uuid()
propiedad_id uuid not null references propiedades(id) on delete cascade
nombre       text not null
foto_path    text null   -- Storage object path, e.g. "{propiedad_id}/{id}.jpg"; null
                             until a photo is uploaded
created_at   timestamptz not null default now()
```

RLS: same shape as `residentes`/`invitaciones` — a `mascotas_select_own`/
`mascotas_insert_own`/`mascotas_delete_own` policy set scoped to
`propiedad_id = current_propiedad_id()`. No update policy needed beyond what
`add_pet`/`remove_pet` skills require (photo replacement is delete-and-reupload, not
in scope per spec Assumptions — matches the same "no in-place edit of synced fields"
stance taken for phone numbers).

## `jobs` (existing table, column renamed)

`invitation_id uuid not null references invitaciones(id) on delete cascade` becomes
`entity_id uuid not null` (FK dropped, mirroring `eventos.entidad_id`). No `entity_type`
column is added — job `kind` (`ACTIVATION`/`EXPIRATION`/`RETRY`) plus which repository
a caller looks the id up in (`invitations` vs. `residents`) is sufficient context,
exactly as `eventos.entidad` already discriminates entity type for events without
needing the jobs table to duplicate that.

**Migration note**: the rename is `alter table jobs rename column invitation_id to
entity_id;` followed by dropping the old FK constraint — a compatible, data-preserving
change; no backfill needed.

## Storage: `mascotas-fotos` bucket

Object path convention: `{propiedad_id}/{mascota_id}.{ext}`. Storage policies (via
`storage.objects` RLS, Supabase's standard pattern) restrict read/write to the path
prefix matching the caller's `current_propiedad_id()` — same isolation guarantee as
every other table, applied to Storage instead of Postgres rows.

## State transitions (permanent access)

Reuses the exact transition-guard pattern `domain/invitation/index.ts` already has
(`assertTransition`/`canTransition`) — a new `domain/resident/index.ts` (or a small
sibling module) exports the equivalent for `ResidentStatus`, so `permanent_access_sync.ts`
validates every transition the same defensive way `rtu_sync.ts` already does.
