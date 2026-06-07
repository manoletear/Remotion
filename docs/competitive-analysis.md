# Análisis competitivo y posicionamiento — Access Layer for GSM Gate Openers

> Objetivo del documento: ubicar nuestra propuesta (capa de acceso descentralizada
> sobre RTU GSM existentes) frente al mercado, definir la propuesta de valor única
> y trazar el roadmap que nos diferencia. Basado en el relevamiento de mercado
> aportado + la arquitectura ya construida (`ARCHITECTURE.md`).

## 1. Tesis de posicionamiento

El mercado de "gestión de invitados" está saturado, pero casi todos los jugadores
caen en una de tres trampas:

1. **Dependen de hardware propio o lectores nuevos** (QR, facial, relés, tags) →
   alto costo de instalación y reemplazo de infraestructura.
2. **Siguen siendo centralizados** (un guardia con app, o un administrador que
   carga accesos) → el administrador sigue siendo cuello de botella.
3. **Son suites PropTech pesadas** (pagos, reservas, comunidad) donde el control de
   acceso es un módulo secundario y genérico.

**Nuestra apuesta:** ser la **capa de acceso descentralizada que funciona sobre el
RTU GSM que el condominio YA tiene instalado**, sin hardware nuevo, con
auto-gestión real del residente y trazabilidad por anfitrión.

Frase de posicionamiento:
> "Convierte tu portón GSM actual en un sistema autogestionado por los residentes —
> sin cambiar hardware, sin guardia, sin administrador como cuello de botella."

## 2. Mapa competitivo

Clasificación por **modelo de solución** y **dependencia de hardware** (el eje que
más nos diferencia).

| Competidor | Región | Modelo | Tecnología al portón | Hardware nuevo | ¿Gestión por residente? |
|---|---|---|---|---|---|
| **Edifito** | Chile | Suite PropTech | QR + WhatsApp | Lector QR | Parcial |
| **Federal Access** | Chile | App acceso + control remoto | App/relé | Sí (control remoto) | Sí |
| **Portaria Gecon** | Brasil | Portería + notificaciones | Portería/guardia | Depende | Notificación, no control |
| **Topia** | Latam | Eventos + accesos | App/QR | Depende | Sí (eventos) |
| **Habitanto** | Ecuador/Global | Suite + QR | QR | Lector QR | Sí |
| **Gard** | Latam | App + cámaras + cancelas | App/relé | Sí (cámaras/relé) | Sí |
| **Tecnorise** | Brasil | Monitoreo de llegadas | App | Depende | Reportes |
| **NoBrokerHood** | India | Gatekeeper (guardia) | App del guardia | No, pero requiere guardia | Pre-registro, no control |
| **GuestRAR** | India | QR + facial | QR/facial | Lector/cámara | Sí |
| **JioGate** | India | Auto-gestión inquilinos | App | Depende | **Sí (alta/baja inquilinos)** |
| **ADDA** | India | Suite multi-punto | App/varios | Depende | Parcial |
| **Sentry Solo** | Global | Pase QR sin hardware | QR (Wallet) | **No** | **Sí** |
| **Gate Masters** | US | Vehículos/tags + videollamada | App/tags | Sí (tags) | Sí |
| **CQGates Homes** | US | Enlaces de acceso seguros | App/enlaces | Depende | Sí |
| **Enclave Connect** | Global | Aprobación en tiempo real | App | Depende | Sí |
| **Planet App** | Global | SaaS comunidad | Varios | Depende | Parcial |

### Lectura del mapa
- **Casi nadie ataca el RTU GSM instalado.** Los que no requieren hardware nuevo
  (Sentry Solo) lo logran cambiando el *paradigma* a QR — es decir, **siguen
  necesitando un lector o una app del guardia en la puerta**. No abren el portón
  físico existente.
- **JioGate** es el más cercano conceptualmente a nuestro modelo descentralizado
  (alta/baja de inquilinos por el propio residente), pero atado a su ecosistema.
- **Edifito / Federal Access** son los referentes en Chile (nuestro mercado inicial):
  fuertes en UX pero centrados en QR/WhatsApp o en su propio control remoto.

## 3. Diferenciadores (por qué ganamos)

| Eje | El mercado | Nosotros |
|---|---|---|
| **Hardware** | Lectores QR, cámaras, relés, tags o guardia | **Cero hardware nuevo**: usamos el RTU GSM ya instalado |
| **Quién gestiona** | Administrador o guardia | **El residente**, autónomo |
| **Cómo se abre** | QR/facial/app propietaria | El método nativo del portón (llamada/SMS desde número autorizado) |
| **Multi-marca RTU** | N/A (hardware propio) | **Capa de abstracción de hardware (HAL)**: adaptadores por marca de RTU |
| **Modelo de datos** | Cada quien el suyo | **Relacional**: cada invitado ligado a su residente anfitrión sobre listas planas del RTU |
| **Trazabilidad** | Variable | Bitácora por residente y por dispositivo |

El foso (moat) defendible no es la UI — es la **HAL multi-marca + el modelo
relacional sobre listas blancas planas**. Eso es lo difícil de copiar y lo que
permite escalar a RTUs de distintos fabricantes sin reescribir la app.

## 4. Mapeo a lo que YA tenemos construido

La arquitectura actual ya materializa la recomendación técnica del relevamiento:

| Recomendación del mercado | Dónde vive en nuestro código |
|---|---|
| "Capa de abstracción de hardware para multi-marca" | `src/skills/rtu/protocol.ts` (protocolo RTU5024 puro) + puerto `SmsGatewayPort`. El RTU es un adaptador detrás del SMS. |
| "Capa lógica que relacione cada invitado con su residente anfitrión" | Dominio `Condominio → Propiedad → Residente → Invitación`; `dispositivo_id`/`rtu_slot` por invitación. |
| "Simular comandos SMS (#ADD 569...)" | `buildAddUserCommand/Remove/Query` + `rtu_add_user/remove/query` skills. |
| "Baja carga del administrador, acceso autónomo del residente" | Skills `create/update/cancel/activate/expire Invitation`, scheduler que activa/expira solo. |
| "Trazabilidad detallada" | Tabla `eventos` + skill `audit_event` (12 eventos auditables). |
| "Notificaciones de entrada/salida (Portaria Gecon, Tecnorise)" | `notifyVisitor` cableado en activación/expiración/cancelación. |

**Conclusión:** el backend ya está alineado con la estrategia ganadora. Lo que falta
es lo que el mercado **sí** tiene y nosotros aún no: la cara visible (frontend del
residente) y soporte multi-marca real.

## 5. Brechas para competir — roadmap priorizado

Ordenado por impacto competitivo / esfuerzo:

### P0 — Paridad mínima para salir al mercado
1. **Frontend del residente** (Next.js): Login, Mis Invitaciones, Nueva Invitación,
   Bitácora. Es la diferencia entre "librería" y "producto". *(En curso.)*
2. **Auth + multi-tenant + autorización**: un residente solo gestiona SU propiedad
   (RLS en Supabase). Hoy no existe — bloqueante para producción.
3. **Worker que ejecute `tick()`** (cron/edge) + webhook Twilio inbound para
   confirmar operaciones reales del RTU.

### P1 — Diferenciación (el moat)
4. **HAL multi-marca**: segundo adaptador de RTU (además de RTU5024) para probar la
   abstracción — p.ej. otra familia King Pigeon o un competidor genérico. Esto es
   nuestro foso real.
5. **Permisos temporales recurrentes** (servicio doméstico, delivery), que el
   relevamiento marca como caso de uso fuerte (Topia, JioGate).
6. **Roles**: residente vs administrador (root) — mapea a "número con permisos vs
   invitado" del relevamiento.

### P2 — Alcance (paridad con suites)
7. WhatsApp real como canal de invitación (Edifito lo usa fuerte en Chile).
8. Reportes/analytics de acceso configurables (Tecnorise).
9. Integración opcional con cámaras/CCTV (Gard, Elissa) — **explícitamente fuera del
   MVP** por nuestro principio de "sin hardware nuevo", pero útil como add-on premium.

### Fuera de alcance deliberado (y es una ventaja)
- Lectura de patentes, facial, QR, biometría. No competimos ahí: nuestra promesa es
  *no cambiar hardware*. Esto nos abarata el go-to-market frente a Edifito/GuestRAR.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fiabilidad del canal SMS al RTU (latencia, fallos) | Reintentos con backoff + verificación `rtuQueryUser` + estado `ERROR` con bitácora (ya implementado). |
| Fragmentación de comandos entre marcas de RTU | HAL: adaptador por marca; el dominio no cambia. |
| Costo por SMS (cada operación = 1-2 SMS) | Slots deterministas (sin duplicados), operaciones idempotentes, verificación opcional. |
| Competidores con QR son "más modernos" | Posicionar la ventaja: cero costo de hardware y funciona con lo instalado; el residente no necesita que el invitado instale nada. |
| Seguridad (password del RTU en claro por SMS) | Es limitación del protocolo; validación de password, control de acceso a la DB, y documentado como secreto de dispositivo. |

## 7. Modelo de negocio (nota breve)
- **SaaS por condominio** (tier por nº de propiedades/dispositivos), con costo
  marginal de SMS trasladado o incluido por volumen.
- **Onboarding sin fricción**: no hay que comprar nada — se conecta sobre el RTU
  existente. Ese es el principal argumento de venta vs. todos los de hardware.

---

### Próximo paso concreto
Avanzar **P0**: frontend del residente sobre Supabase real (pendiente de desbloquear
cupo de proyecto) + auth/RLS, que es exactamente lo que el mercado ya tiene y a
nosotros nos falta para pasar de "librería sólida" a "producto vendible".
