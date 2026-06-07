# Plan P0 — Producto vendible (frontend del residente + operación real)

> **Objetivo:** pasar de "librería de acceso sólida" a un **producto desplegable**:
> un residente inicia sesión, ve y gestiona sus invitaciones, y el ciclo de vida
> del acceso (activar/expirar/reintentar) corre **solo**, server-side, contra un
> RTU real vía Twilio.
>
> **Principio rector:** el frontend nunca habla con la base de datos ni con el RTU
> directamente — **siempre pasa por las skills** del access layer a través de
> *server actions*. Eso mantiene toda la lógica probada y deja P1 enchufable.

## 0. Punto de partida (lo que YA existe y reusamos)
- Dominio + máquina de estados de invitación (`src/domain`, `src/skills`).
- Orquestación `tick()` (`invitation_lifecycle.ts`) y `rtu_sync.ts`.
- Puertos con doble implementación: `DataStore` (`in_memory` + `supabase_store`),
  `SmsGatewayPort` (`fake` + **`twilio`**), `SchedulerPort` (`in_memory` +
  **`supabase_scheduler`**), `NotificationPort` (`console`).
- Migraciones `0001_access_layer_core`, `0002_scheduler_jobs`.
- `TwilioSmsGateway` ya contempla el modelo **async** de respuesta SMS vía
  `awaitInbound(from, sinceIso, timeoutMs)` (seam para el webhook inbound).

➡️ P0 es sobre todo **frontend + auth/RLS + wiring + cron + webhook**, no reescribir backend.

---

## 1. Workstreams

### A. Empaquetado: hacer que la web app consuma el access layer
- **Estructura:** workspace npm con `apps/web` (Next.js) + el access layer como
  paquete interno `@gate/access-layer` (mover `src/` a `packages/access-layer/src`,
  o mantener `src/` en raíz e importar con `transpilePackages` + `externalDir`).
  *Recomendado MVP:* `apps/web` + `packages/access-layer` (refactor mecánico, sin
  tocar lógica) para imports limpios y un solo `tsconfig` base.
- **Factory de contexto server-side:** `makeServerContext(session)` que arma el
  `SkillContext` con:
  - `SupabaseDataStore` (cliente con sesión del usuario → respeta RLS).
  - `TwilioSmsGateway` (+ `awaitInbound` apuntando a la tabla `inbound_sms`).
  - `SupabaseScheduler`.
  - notifier real (P2; en P0 basta `ConsoleNotifier` o WhatsApp mínimo).

### B. Base de datos: auth + multi-tenant (RLS)
- **Migración `0003_auth_rls.sql`:**
  - `perfiles`: `id uuid PK references auth.users`, `residente_id references residentes`,
    `rol text not null default 'RESIDENT'` ⬅️ *seam de roles para P1*, `created_at`.
  - `ALTER ... ENABLE ROW LEVEL SECURITY` en todas las tablas de negocio.
  - Funciones helper: `current_residente_id()` y `current_propiedad_id()` desde `auth.uid()`.
  - **Políticas** (residente):
    - `residentes`/`propiedades`: ve/edita solo su propia fila / su propiedad.
    - `invitaciones`: CRUD solo donde `propiedad_id = current_propiedad_id()`.
    - `eventos`: lectura de eventos de sus propias entidades.
    - `dispositivos`: lectura del device de su condominio.
- **Vínculo auth↔residente (decisión, ver §3):** trigger `handle_new_user` que
  enlaza por email/teléfono, **o** skill explícita `linkResidentToAuthUser`.

### C. Frontend (Next.js App Router, UI en español)
- Rutas:
  - `/login` — Supabase Auth (magic link o password).
  - `/` — dashboard: lista de invitaciones del residente con badges de estado.
  - `/invitaciones/nueva` — formulario (visitante nombre/teléfono, ventana inicio/fin).
    Incluye un campo `tipo` **oculto y fijo en `PUNTUAL`** ⬅️ *seam recurrencia P1*.
  - `/invitaciones/[id]` — detalle + cancelar + **bitácora** (timeline de `eventos`).
  - `/perfil` — editar nombre/teléfono (usa `updateResident`).
- **Server actions** (resuelven el residente desde la sesión y llaman la skill):
  `crearInvitacionAction` → `createInvitation`; `cancelarInvitacionAction` →
  `cancelInvitation`; `actualizarPerfilAction` → `updateResident`. `revalidatePath`
  tras cada una.
- Stack UI: Tailwind + set mínimo de componentes.

### D. Ejecución del ciclo de vida (el "worker")
- **Vercel Cron** (1/min) → `POST /api/tick` (protegido por secreto) → `tick(ctx, now)`.
- `tick()` ya usa `SupabaseScheduler` (jobs persistentes en `0002`), así que los
  RETRY sobreviven reinicios. **No** se requiere proceso long-running.
- Endpoint autenticado con `CRON_SECRET`; corre con contexto de servicio (service role)
  porque opera sobre todas las invitaciones, no las de un usuario.

### E. Twilio real (comunicación con el RTU)
- **Outbound:** `TwilioSmsGateway.send` ya implementado (REST por `fetch`).
- **Inbound (webhook):** `POST /api/sms/inbound` recibe la respuesta del RTU →
  valida firma Twilio → inserta en tabla **`inbound_sms`** (migración `0004`).
  `awaitInbound` hace polling de esa tabla correlacionando por `from` (numero_sim)
  y `sinceIso`. Esto cierra el lazo `sendAndAwaitReply` con SMS reales (asíncronos).
- Migración `0004_inbound_sms.sql`: `inbound_sms(id, from_number, body, received_at, consumed_at)`.

### F. Despliegue y configuración
- Proyecto Vercel; env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM`, `CRON_SECRET`.
- CI: `typecheck` + `test` en cada PR.

---

## 2. Secuencia / milestones
Cada milestone es entregable y se puede demostrar antes de pasar al siguiente.
Los M1–M4 pueden correr contra `ConsoleNotifier`/`FakeSmsGateway` antes de cablear Twilio.

| # | Milestone | Resultado demostrable |
|---|---|---|
| **M0** | Empaquetado + `makeServerContext` + app skeleton | `next build` verde, importa el access layer |
| **M1** | Migración `0003` auth+RLS + vínculo auth↔residente | Un residente solo "ve" sus filas (probado por SQL) |
| **M2** | Login + resolución sesión→residente | Entrar y obtener el residente actual |
| **M3** | Vistas de lectura (dashboard, detalle, bitácora) | Residente ve sus invitaciones y eventos (RLS) |
| **M4** | Flujos de escritura (crear/cancelar/perfil) | Crear y cancelar invitación desde la UI |
| **M5** | `/api/tick` + Vercel Cron | Invitación se activa/expira sola |
| **M6** | Twilio outbound + `/api/sms/inbound` + `0004` | Acceso real cargado/quitado en un RTU físico |
| **M7** | Deploy a Vercel + smoke e2e | App pública funcionando contra Supabase real |

---

## 3. Decisiones pendientes (tuyas)
1. **Vínculo auth↔residente:** ¿el admin pre-crea el residente y el usuario se
   registra (enlace por email/teléfono), o auto-registro con asignación posterior?
   *Recomendado:* admin/seed crea residente + `perfiles`, enlace por email.
2. **Estructura repo:** ¿workspace `apps/web` + `packages/access-layer` (recomendado)
   o `web/` con `externalDir`? Afecta solo ergonomía de imports.
3. **Auth method:** magic link (sin password, más simple) vs email+password.
   *Recomendado:* magic link para MVP.

---

## 4. Contrato de integración (lo que P0 DEJA listo para P1)
P0 debe preservar estos **seams** para que P1 no requiera reescritura:

1. **Seam de identidad/roles** → `perfiles.rol` existe desde `0003` (default `RESIDENT`).
   P1 solo agrega el valor `ADMIN` + ramas de política; no hay migración de datos.
2. **Seam de adaptador RTU** → la UI jamás referencia RTU5024; todo pasa por skills
   que reciben `device`. P1 introduce el `RtuAdapter` por marca sin tocar el frontend.
3. **Seam de tipo de invitación** → el formulario y `createInvitation` manejan un
   campo `tipo` (fijo `PUNTUAL` en P0). P1 agrega `RECURRENTE` como una rama.
4. **Seam de acceso a datos** → todo va por el puerto `DataStore`/skills. Tablas y
   columnas nuevas de P1 quedan detrás del puerto; los componentes no cambian.
