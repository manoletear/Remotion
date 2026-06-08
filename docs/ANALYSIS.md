# ANÁLISIS DE REQUISITOS — CondoGATE: Capa de Acceso Digital para Portones GSM

## Clasificación
Tipo: SaaS + API/Integration (Híbrido)
Complejidad estimada: Alta
MVP estimado: 6–8 semanas (M0–M4 completados parcialmente; M5–M7 pendientes)

## Problema
Los condominios que operan portones automáticos vía dispositivos GSM (ej. RTU5024) no tienen forma digital de gestionar accesos temporales: un residente no puede crear un permiso para un visitante sin llamar a la administración o compartir su propio número de teléfono con el dispositivo. La administración tampoco tiene trazabilidad de quién autorizó qué acceso ni auditoría de errores de sincronización. Hoy se resuelve con llamadas telefónicas, cuadernos físicos y acceso irrestricto al número SIM del portón.

## Usuarios y Actores
| Actor | Rol | Permisos |
|-------|-----|----------|
| Residente | Usuario final | CRUD invitaciones propias, ver bitácora de su unidad |
| Administrador | Operador del condominio | Provisionar condominios/propiedades/residentes/dispositivos, ver toda la bitácora |
| Visitante | Destinatario del acceso | No tiene cuenta — es identificado por número de teléfono |
| Worker (cron) | Proceso server-side | Activar/expirar invitaciones, sincronizar RTU, reintentar errores |
| RTU5024 | Dispositivo físico (actor externo) | Recibe comandos SMS, responde confirmación |

## Funcionalidades Core (MVP)
1. **Gestión de invitaciones** — Residente crea, edita, cancela permisos de acceso temporal con ventana de tiempo y número de teléfono del visitante.
2. **Ciclo de vida automático** — Worker corre cada minuto: activa invitaciones al inicio de la ventana, las expira al fin, reintenta errores con backoff.
3. **Sincronización RTU** — Al activar, reserva slot en phonebook del dispositivo y envía comando SMS `ADD`; al expirar, envía `REMOVE`. Desacoplado: despacho + confirmación async.
4. **Auth multi-tenant con RLS** — Cada residente ve solo sus filas (Supabase Auth + Row Level Security). El worker usa service role.
5. **Dashboard del residente** — Lista de invitaciones con badge de estado (CREATED / ACTIVE / EXPIRED / ERROR), detalle con bitácora de eventos.
6. **Bitácora de auditoría** — Registro inmutable de cada transición de estado, comando RTU enviado, confirmación recibida y error detectado.
7. **Webhook inbound SMS** — Recibe respuesta async del RTU via Twilio → correlaciona con invitación → confirma ACTIVE / REMOVED o lanza RETRY.

## Funcionalidades Futuras (V2+)
- Roles admin: provisionar condominios/propiedades desde la UI (P1)
- Invitaciones recurrentes (tipo RECURRENTE — seam ya preparado)
- Soporte multi-marca de RTU (adaptador por marca — seam ya preparado)
- Notificaciones al residente (WhatsApp/push cuando visitante accede)
- Lectura de patente / QR (fuera de MVP por hardware adicional)
- Panel de administración con vista cross-tenant
- Facturación / suscripción por condominio (SaaS billing)

## Entidades de Datos
| Entidad | Campos clave | Relaciones |
|---------|-------------|------------|
| Condominio | nombre, dirección | tiene N Propiedades, N Dispositivos |
| Propiedad | número/nombre, condominio_id | tiene N Residentes, N Invitaciones |
| Residente | nombre, apellido, teléfono, email, avatar_url | pertenece a Propiedad |
| Perfil (auth) | user_id (auth.uid), residente_id, rol | 1:1 con Residente |
| Dispositivo | numero_sim, modelo, condominio_id | RTU físico del condominio |
| Invitación | visitante_nombre, visitante_telefono, inicio, fin, estado, rtu_slot, motivo, patente, creado_por | pertenece a Propiedad, tiene N Eventos |
| Evento | tipo, entidad_id, payload, created_at | audit trail inmutable |
| Job | tipo, payload, run_at, attempts | scheduler persistente (Supabase) |
| Inbound SMS | from_number, body, received_at, consumed_at | respuestas async del RTU |

**Datos sensibles:** números de teléfono de residentes y visitantes, número SIM del dispositivo, historial de accesos → requiere RLS estricto y service role separado.

## Integraciones Requeridas
| Sistema | Tipo | Dirección |
|---------|------|-----------|
| Supabase Auth | BaaS auth | Inbound (login del residente) |
| Supabase Postgres | BaaS DB + RLS | Bidireccional (read/write via SDK) |
| Twilio SMS | REST API | Outbound (comandos al RTU) + Inbound webhook (respuestas RTU) |
| RTU5024 | Protocolo SMS propietario | Outbound (comandos) + Inbound (confirmaciones) |
| Vercel Cron | Scheduler serverless | Inbound trigger `POST /api/tick` cada minuto |

## Escala Esperada
- Usuarios: 50–500 residentes por condominio (MVP = 1 condominio)
- Invitaciones: 100–1.000/mes por condominio
- Eventos (audit): 10–20 por invitación → 1.000–20.000/mes
- SMS outbound: 2 por invitación (ADD + REMOVE) → 200–2.000/mes
- Multi-tenant: Sí (arquitectura lista; UI admin en V2)

## Restricciones
- **Hardware fijo:** RTU5024 usa protocolo SMS propietario (`1234A<slot>#<phone>#`) — no hay API REST
- **Serverless (Vercel):** sin procesos long-running; tick debe terminar en <10s → reconciliador async obligatorio
- **Twilio número:** el FROM debe ser el número que el RTU tiene autorizado como master (o el número SIM)
- **Slots RTU:** phonebook slots 100–200 para invitaciones, 1–99 para residentes permanentes (hardware limit)
- **RLS obligatorio:** datos de acceso físico requieren aislamiento DB-level, no solo lógica de aplicación

## Gaps Detectados
1. **Vínculo auth↔residente no automatizado** — ¿Cómo se enlaza un `auth.uid` a un `residente_id`? Hoy es manual/seed. Impacto: **Alto** (bloquea M2 login real)
2. **Notificaciones al residente** — `ConsoleNotifier` en uso. ¿WhatsApp, email, push? Sin definir. Impacto: **Medio** (UX degradada si visitante accede sin aviso)
3. **Flujo de provisioning de condominios** — Sin UI admin. ¿Quién crea condominios/propiedades en producción? Hoy solo por seed SQL. Impacto: **Medio** (bloquea onboarding de nuevos clientes)
4. **Número Twilio vs número SIM** — El RTU solo responde al número configurado como master. Si se usa un número Twilio como FROM, el RTU debe estar configurado para aceptarlo. Requiere validación con hardware real. Impacto: **Alto** (bloquea M6)
5. **Seguridad del webhook inbound** — `/api/sms/inbound` debe validar firma Twilio para evitar inyección de SMS falsos que activen/desactiven accesos. Impacto: **Alto** (riesgo de seguridad física)
6. **Límite de intentos y slot recovery** — Si una invitación queda en ERROR permanente, ¿el slot RTU se libera? `MAX_LIFETIME_ATTEMPTS` existe pero el slot-clearing en error final no está confirmado. Impacto: **Medio**

## Supuestos Asumidos
- El RTU5024 ya está instalado y funcionando con número SIM activo
- El condominio tiene cobertura GSM en el dispositivo
- El administrador provisiona residentes manualmente o por seed (P0); UI admin es P1
- Magic link es el método de auth (más simple para MVP)
- Un residente = una propiedad (no se modelan co-propietarios en MVP)
- La zona horaria es Chile (`DEFAULT_COUNTRY_CODE=+56`); las ventanas de tiempo son en hora local
- El `CRON_SECRET` protege `/api/tick` contra llamadas externas no autorizadas
