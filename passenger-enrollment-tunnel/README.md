# Túnel de Inscripción de Pasajeros (FNRH Digital)

Middleware para automatizar el registro digital de huéspedes en Brasil (FNRH
Digital, Portaria MTur nº 41/2025) e inyectarlo en la **API REST V2 de SNRHos**,
con captura omnicanal, escaneo OCR/MRZ, cola de contingencia offline y
trazabilidad LGPD.

> **Por qué vive en este repositorio.** El proyecto base (`/src`, "Access Layer
> for GSM Gate Openers") ya es un middleware con **arquitectura hexagonal**
> —`domain / skills / mcp(ports) / orchestration / shared`— que sincroniza un
> dispositivo externo a través de un adaptador, con reintentos por backoff
> exponencial, máquina de estados y bitácora de auditoría. El túnel FNRH tiene
> **exactamente la misma forma**: solo cambia el dispositivo (RTU por SMS) por la
> **API de SNRHos por HTTPS**. Por eso se reutiliza el stack en lugar de
> inventar uno nuevo. Ver [STACK.md](./STACK.md).

## Mapa conceptual (reutilizando el patrón existente)

| Access Layer (existente)        | Túnel FNRH (este módulo)                       |
|---------------------------------|------------------------------------------------|
| `Invitation` + máquina de estados | `Ficha` (FNRH) + máquina de estados          |
| Adaptador RTU sobre SMS (Twilio)| Adaptador **SNRHos REST V2** sobre HTTPS       |
| `rtu_sync` con backoff          | `snrhos_sync` con **cola de contingencia**     |
| Scheduler de lifecycle          | Eventos PMS: reserva, check-in, no-show, checkout |
| SMS Twilio a la visita          | Link de pre-check-in por WhatsApp/SMS/email    |
| Bitácora de eventos (`Event`)   | Bitácora LGPD (log inalterable)                |

## Estructura

```text
passenger-enrollment-tunnel/
  src/
    domain/        Ficha (FNRH) + máquina de estados; Pessoa/Hospede/Documento
    shared/        enums, errores
    mcp/           ports + fakes: snrhos (API REST), ocr (OCR/MRZ)
    skills/        casos de uso: scan_document, create_ficha
    orchestration/ snrhos_sync (motor con contingencia offline)
    reporting/     export a Excel (.xlsx) de todas las fichas
    demo.ts        ciclo pre-checkin -> scan -> confirmar -> registro -> Excel
  mockup/          pantalla "confirmar y corregir" (HTML, abrir en navegador)
  STACK.md         análisis de stack (qué y por qué)
  ARCHITECTURE.md  documento técnico + diagrama + máquina de estados
  tsconfig.json    typecheck aislado del subproyecto
```

## Estado

Esqueleto de fundación: dominio, ports con adaptadores fake, dos skills y el
motor de sincronización con contingencia. Los adaptadores reales (cliente HTTP
SNRHos, SDK de OCR/MRZ, WhatsApp/SMS, persistencia cifrada AES-256) son el
siguiente hito — se enchufan sin tocar la lógica de negocio porque los skills
dependen solo de **ports**.

```bash
# desde la raíz del repo
npx tsx passenger-enrollment-tunnel/src/demo.ts
# genera passenger-enrollment-tunnel/out/fichas.xlsx con toda la data
```

## Export a Excel (paso intermedio)

Mientras el cliente HTTP real de SNRHos y el conector Gov.br no estén en
producción, `reporting/excel_export.ts` vuelca **toda la data de las fichas a un
`.xlsx`** (una fila por huésped, ~28 columnas FNRH) para respaldo, auditoría o
carga manual. ⚠️ LGPD: ese archivo contiene PII completa — guardar cifrado y con
acceso restringido (a diferencia de la bitácora, que no lleva PII).
