# Supabase — esquema y orden de aplicación

Todo el SQL para crear las tablas está aquí, listo para aplicar **cuando se cree
el proyecto Supabase** (pendiente de liberar cupo en el plan free).

## Archivos

| Archivo | Para qué |
|---|---|
| `migrations/0001_access_layer_core.sql` | Tablas de dominio, enums, unicidad de slot por dispositivo, trigger `updated_at`. **Fuente de verdad.** |
| `migrations/0002_scheduler_jobs.sql` | Tabla `jobs` (timers durables del worker). **Fuente de verdad.** |
| `schema.sql` | **Consolidado** de 0001+0002 en un solo archivo, para bootstrap de un proyecto vacío en una sola pasada. |

> Las migraciones numeradas son la fuente de verdad para cambios incrementales.
> `schema.sql` es solo conveniencia para arrancar una base nueva de cero.

## Cómo aplicar (cuando exista el proyecto)

**Opción A — una sola pasada (recomendado para base nueva):**
- Pegar `schema.sql` en el SQL editor de Supabase, o aplicarlo vía MCP.

**Opción B — migración por migración (incremental / control de versiones):**
1. `0001_access_layer_core.sql`
2. `0002_scheduler_jobs.sql`

Tras aplicar, generar los tipos TypeScript del proyecto para el `SupabaseDataStore`.

## Tablas que se crean
`condominios` · `propiedades` · `residentes` · `dispositivos` · `invitaciones`
· `eventos` · `jobs` (+ enums y el trigger `set_updated_at`).

## Pendiente (llega como migraciones nuevas en P0 — ver `docs/plan-p0.md`)
Estas **no** están aún porque requieren un proyecto con `auth.users` ya existente:

- `0003_auth_rls.sql` — tabla `perfiles` (vínculo `auth.users` ↔ `residentes`,
  con columna `rol` default `RESIDENT`) + **Row Level Security** y políticas
  multi-tenant (cada residente solo gestiona su propiedad).
- `0004_inbound_sms.sql` — tabla `inbound_sms` para correlacionar las respuestas
  del RTU recibidas por el webhook de Twilio (`awaitInbound`).
