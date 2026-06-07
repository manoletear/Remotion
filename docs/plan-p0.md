# Plan P0 — Producto vendible (frontend del residente + operación real)

> **Objetivo:** pasar de "librería de acceso sólida" a un **producto desplegable**:
> un residente inicia sesión, ve y gestiona sus invitaciones, y el ciclo de vida
> del acceso (activar/expirar/reintentar) corre **solo**, server-side, contra un
> RTU real vía Twilio.
>
> **Principio rector:** el frontend nunca habla con la base de datos ni con el RTU
> directamente — **siempre pasa por las skills** del access layer a través de
> *server actions*. Eso mantiene toda la lógica probada y deja P1 enchufable.

## Revisión post-M0 (estado actual)
> Actualización tras construir y verificar **M0** (rama `claude/p0-web-app`).

**Lo que se validó:**
- El seam de integración es real: la app corre completa contra fakes y para ir
  "Supabase real" solo se cambia `web/lib/context.ts`. Confirmado en código.
- **M3/M4 ya están demostrados contra fakes** (listar/crear/cancelar/bitácora).
- Se añadió el **seam de sesión `getCurrentResident()`** (único punto que cambia
  para el login de M2) + el punto de autorización por propiedad.

**Decisiones que se resolvieron (ver §3):**
- **Estructura del repo** → ni monorepo ni `externalDir`: la librería se compila a
  `dist/` y la web la importa como ESM ya compilado vía `file:..`. Más simple, sin
  mover `src/`.

**Hueco detectado (corrección importante, ver §1.D/E):**
- El loop RTU `sendAndAwaitReply` es **bloqueante (hasta 60s)** dentro de `tick()`.
  En serverless (Vercel Cron) eso **no escala** (N activaciones × 60s por invocación).
  → Hay que **desacoplar despacho de confirmación** (reconciliador). Es un ítem de
  diseño de P0, no un detalle.

---

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

### A. Empaquetado: hacer que la web app consuma el access layer ✅ (M0 hecho)
- **Estructura (RESUELTO):** la librería se compila a `dist/` (`tsconfig.build.json`
  + `exports` en `package.json`) y la web app (`web/`) la importa como **ESM ya
  compilado** vía dependencia `file:..`. Evita mover `src/` y evita que Next
  tropiece con los imports `.js` de NodeNext. `serverExternalPackages` la mantiene
  server-only. *(Se descartó el monorepo `apps/web` + `packages/access-layer`.)*
- **Build-order:** la librería debe compilarse **antes** del `next build` (la web
  importa `dist/`). Ver §F para el wrinkle de despliegue.
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

> ⚠️ **Ítem de diseño (descubierto en M0): reconciliador, no espera bloqueante.**
> Hoy `rtu_sync` hace `sendAndAwaitReply` bloqueante (hasta `RTU_ACK_TIMEOUT_MS`
> = 60s) *dentro* de `tick()`. En serverless, un `tick` con N activaciones haría
> N × 60s secuencial → revienta el límite de tiempo de función. **Solución:**
> desacoplar en dos fases dirigidas por ticks + webhook inbound:
> 1. *Despacho* (tick A): envía el comando, deja la invitación en `PENDING_SYNC`
>    con `sent_at`. No espera respuesta.
> 2. *Confirmación* (tick B): correlaciona la respuesta del RTU (de `inbound_sms`,
>    §E) y transiciona a `ACTIVE`/`ERROR`.
>
> Probablemente requiere una migración chica (`invitaciones.sent_at` / flag
> "esperando confirmación") y un ajuste en `rtu_sync`. Mantiene `tick()` rápido y
> acotado. **Decisión de fondo, ver §3.**

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
- **Build-order en Vercel (wrinkle de M0):** como `web/` depende de la librería por
  `file:..`, el build debe compilar la librería **primero**. Resolver con un
  `vercel-build` (`npm --prefix .. run build && next build`) o un `prebuild` que
  corra `npm run build` en la raíz. Sin esto, `dist/` no existe en el deploy.
- CI: `typecheck` + `test` (librería) + `next build` (web) en cada PR.

---

## 2. Secuencia / milestones
Cada milestone es entregable y se puede demostrar antes de pasar al siguiente.
Los M1–M4 pueden correr contra `ConsoleNotifier`/`FakeSmsGateway` antes de cablear Twilio.

| # | Milestone | Resultado demostrable | Estado |
|---|---|---|---|
| **M0** | Empaquetado + `makeServerContext` + app skeleton | `next build` verde, importa el access layer | ✅ hecho |
| **M1** | Migración `0003` auth+RLS + vínculo auth↔residente | Un residente solo "ve" sus filas (probado por SQL) | ⏳ requiere Supabase |
| **M2** | Login + resolución sesión→residente | Entrar y obtener el residente actual | 🟡 seam `getCurrentResident` listo; falta login real |
| **M3** | Vistas de lectura (dashboard, detalle, bitácora) | Residente ve sus invitaciones y eventos | 🟡 demostrado en fakes; falta RLS |
| **M4** | Flujos de escritura (crear/cancelar/perfil) | Crear y cancelar invitación desde la UI | 🟡 crear/cancelar en fakes; falta `/perfil` + RLS |
| **M5** | `/api/tick` + Vercel Cron + **reconciliador** (§D) | Invitación se activa/expira sola, sin esperas bloqueantes | ⏳ requiere Supabase |
| **M6** | Twilio outbound + `/api/sms/inbound` + `0004` | Acceso real cargado/quitado en un RTU físico | ⏳ requiere Supabase + hardware |
| **M7** | Deploy a Vercel (build-order §F) + smoke e2e | App pública funcionando contra Supabase real | ⏳ |

---

## 3. Decisiones
**Resueltas:**
- ~~Estructura repo~~ → librería a `dist/` + web por `file:..` (no monorepo). *(M0)*

**Pendientes (tuyas):**
1. **Vínculo auth↔residente:** ¿el admin pre-crea el residente y el usuario se
   registra (enlace por email/teléfono), o auto-registro con asignación posterior?
   *Recomendado:* admin/seed crea residente + `perfiles`, enlace por email.
2. **Auth method:** magic link (sin password, más simple) vs email+password.
   *Recomendado:* magic link para MVP.
3. **Reconciliador del loop RTU (nueva, §1.D):** confirmar el desacople despacho/
   confirmación dirigido por ticks + inbound (en vez de la espera bloqueante).
   *Recomendado:* sí — es lo que permite correr en serverless. Implica `0004` +
   `invitaciones.sent_at` y un ajuste en `rtu_sync`.

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
