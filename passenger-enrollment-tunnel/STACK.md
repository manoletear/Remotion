# Stack para el Túnel de Inscripción de Pasajeros

Análisis del stack a partir de la especificación de arquitectura del túnel FNRH
Digital, **anclado a lo que este repositorio ya es**: un middleware hexagonal en
TypeScript/Node con Supabase + Twilio y adaptadores fake para pruebas.

## Conclusión

No conviene un stack nuevo en C#/.NET (las clases `.cs` del documento —
`Pessoa.cs`, `Documento.cs`, `Checkin.cs`, `Reservas.cs` — son solo el naming de
la **biblioteca oficial de SNRHos**, no un requisito de implementación). El
camino de menor riesgo es **extender el stack existente**, porque ya resuelve los
problemas difíciles del túnel: máquina de estados, sincronización con un sistema
externo, reintentos con backoff, idempotencia y bitácora de auditoría.

## Stack por capa

| Capa | Tecnología | Reutiliza del repo | Notas |
|---|---|---|---|
| **Lenguaje / runtime** | TypeScript + Node ≥ 20 (ESM) | `package.json`, `tsconfig.json` | Mismo `tsc --noEmit` y `node --test` |
| **Arquitectura** | Hexagonal (puertos y adaptadores) | `domain/skills/mcp/orchestration/shared` | Skills = funciones puras sobre `Context` |
| **Dominio** | Entidades + máquina de estados | patrón `assertTransition` de `domain/invitation` | `Ficha` con estados FNRH + contingencia |
| **Persistencia** | Supabase/Postgres | `mcp/supabase` (port + in-memory + real) | Tablas espejo de los enums; RLS para LGPD |
| **Integración gobierno** | **API REST V2 de SNRHos** (HTTPS, v2.3/v2.4) | nuevo port `mcp/snrhos` (espejo de `sms_gateway`) | Auth por API-Key/Token de Cadastur |
| **Captura omnicanal** | WhatsApp Business / SMS / email | `mcp/sms_gateway` (Twilio) ya existe | El link de pre-check-in es un `send()` más |
| **Escaneo documental** | OCR + MRZ | nuevo port `mcp/ocr` | Fake en tests; real con Tesseract/PaddleOCR o SDK (Regula/Microblink) |
| **Identidad nacional** | Conector Gov.br (OAuth, nivel "Oro") | nuevo adaptador detrás del port `ocr`/`identity` | Bloquea edición de nombre/CPF |
| **Contingencia offline** | Cola local cifrada + reintento asíncrono | `orchestration/rtu_sync` + scheduler | Estado `CONTINGENCY`, drenaje por backoff |
| **Scheduler** | Jobs durables | `mcp/scheduler` (in-memory + supabase) | Dispara RETRY y eventos de lifecycle |
| **Integración PMS** | Conectores Desbravador/Opera/Totvs | nuevo port `mcp/pms` | Mapea reserva/check-in/no-show/checkout |
| **Seguridad** | TLS 1.3 en tránsito, AES-256 en reposo, RBAC + MFA, log inalterable | bitácora `Event` ya existe | Cumplimiento LGPD (Art. 7 II y Art. 14) |

## Qué se construye nuevo vs. qué se reutiliza

**Se reutiliza tal cual:** el esqueleto hexagonal, el patrón de ports con
fakes, `withRetry` (backoff 2s/4s/8s/16s), el scheduler, la bitácora de
auditoría y el adaptador Twilio (para el link de pre-check-in).

**Se construye nuevo (siguiendo el mismo patrón):**

1. `domain/ficha` — entidad FNRH y su máquina de estados con modo contingencia.
2. `mcp/snrhos` — port + fake del cliente REST V2 (espejo de `sms_gateway`).
3. `mcp/ocr` — port + fake de extracción OCR/MRZ.
4. `orchestration/snrhos_sync` — motor que, ante 5xx/timeout de SNRHos,
   conmuta a `CONTINGENCY` y drena la cola cuando vuelve el servicio.
5. `mcp/pms` — port de eventos del PMS (siguiente hito).

## Decisión clave

> El documento describe el *qué* (validar local, enviar a SNRHos, resistir
> caídas). Este repositorio ya tiene el *cómo* probado para un caso isomorfo
> (validar, enviar a un dispositivo, resistir fallos de SMS). El stack es:
> **reusar el patrón, cambiar el adaptador de salida de RTU/SMS a SNRHos/HTTPS,
> y añadir OCR/MRZ y la cola de contingencia.**
