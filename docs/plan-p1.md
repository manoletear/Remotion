# Plan P1 — Diferenciación (el "moat") sobre los seams de P0

> **Objetivo:** construir lo que hace defendible al producto —
> **(1) HAL multi-marca**, **(2) permisos recurrentes**, **(3) roles** —
> enchufando en los *seams* que P0 dejó listos, **sin reescribir** frontend ni dominio.
>
> Cada ítem es **independiente y entregable por separado**. Orden sugerido por
> riesgo/valor: HAL → Roles → Recurrencia (el más complejo, al final).

---

## 1. HAL — Capa de abstracción de hardware (RTU multi-marca)
**Por qué:** es el foso real. Permite vender sobre el RTU ya instalado sin importar
la marca, sin reescribir la app.

**Estado actual:** la lógica RTU5024 vive en `src/skills/rtu/protocol.ts` como
funciones puras (`buildAddUserCommand`, `parseMutationReply`, `parseQueryReply`…),
y los skills `rtu_add_user/remove/query` ya reciben `device` y aíslan el I/O. El
seam está limpio.

**Diseño:**
- Definir interfaz `RtuAdapter`:
  ```ts
  interface RtuAdapter {
    buildAddCommand(password: string, slot: number, phone: string): string;
    buildRemoveCommand(password: string, slot: number): string;
    buildQueryCommand(password: string): string;
    parseMutationReply(reply: string | null): RtuResultStatus;
    parseQueryReply(reply: string | null): string[] | null;
    readonly slotRange: { start: number; max: number };
  }
  ```
- `Rtu5024Adapter` = el código actual movido detrás de la interfaz (sin cambios de comportamiento).
- Registro `getAdapter(device): RtuAdapter` seleccionado por `device.marca`/`device.modelo`.
- Los skills `rtu_*` y `rtu_sync.ts` (`assignSlot` usa `RTU5024.*`) pasan a usar
  `getAdapter(device)` en vez de importar RTU5024 directamente.
- **Segundo adaptador** real (p.ej. otra familia King Pigeon o un relé genérico)
  para *probar* que la abstracción aguanta — el verdadero entregable de valor.

**Migración aditiva** `0005_device_brand.sql`: `dispositivos.marca text default 'RTU5024'`,
`modelo text`. RLS sin cambios.

**Integración con P0 (seam #2):** frontend y server actions intactos — solo cambia
el cableado interno de los skills. Tests existentes siguen verdes con el adaptador RTU5024 por defecto.

**Riesgos:** rangos de slot y formato de comando difieren por marca → encapsulados
en `slotRange` y los `build*`. Respuestas heterogéneas → cada adapter trae su `parse*`.

---

## 2. Roles (residente vs administrador / root)
**Por qué:** mapea al "número con permisos (root) vs invitado" del análisis de mercado;
habilita la gestión del condominio sin que el admin sea cuello de botella operativo.

**Estado actual:** `perfiles.rol` ya existe desde `0003` (P0), default `RESIDENT`.

**Diseño:**
- Agregar valor `ADMIN` (y opcional `perfiles.condominio_id` para alcance de admin).
- Capacidades de admin (skills de provisioning ya existen): registrar residentes/
  propiedades/dispositivos, ver eventos de todo el condominio, gestionar cualquier invitación.
- **RLS:** ramas de política `WHEN rol = 'ADMIN'` con alcance por `condominio_id`.
- **Frontend:** rutas `/admin/...` gateadas por el rol de la sesión.

**Migración aditiva** `0006_admin_role.sql`: opcional `perfiles.condominio_id` + políticas.

**Integración con P0 (seam #1):** sin migración de datos sobre lo existente — solo
nuevo valor de enum, políticas y UI. La resolución sesión→perfil de P0 ya expone el `rol`.

---

## 3. Permisos recurrentes (servicio doméstico, delivery)
**Por qué:** caso de uso fuerte del mercado (Topia, JioGate). El más complejo:
toca dominio + reconciliador.

**Diseño:**
- Dominio: `Invitation.tipo: PUNTUAL | RECURRENTE` + `recurrencia jsonb`
  (días de semana + rango horario, p.ej. `{ dias: [1..5], desde: "08:00", hasta: "18:00" }`).
- `createInvitation` acepta `tipo`/`recurrencia`; la máquina de estados no cambia.
- **Reconciliador (`tick`)**: para una invitación `RECURRENTE`, calcula si *ahora*
  cae dentro de una ocurrencia activa → carga el acceso al inicio de la ocurrencia
  y lo quita al final, reusando `syncAddAccess`/`syncRemoveAccess`.
  - **Anti-thrash (decisión):** mantener el acceso cargado durante el día activo y
    solo cargar/quitar en los bordes, para no gastar SMS en cada `tick`.
- **Frontend:** `/invitaciones/nueva` muestra opciones de recurrencia cuando
  `tipo = RECURRENTE` — la rama que el campo-seam de P0 ya dejó preparada.

**Migración aditiva** `0007_recurring_invitations.sql`: `invitaciones.tipo`,
`invitaciones.recurrencia jsonb`. RLS igual (sigue scoped por `propiedad_id`).

**Integración con P0 (seam #3):** la invitación puntual es el caso `tipo = PUNTUAL`;
recurrencia es una rama nueva en UI + reconciliador. Sin reescritura.

**Decisiones pendientes:**
1. Estrategia de bordes de ocurrencia (cargar/quitar diario vs por ventana) — afecta costo SMS.
2. Modelo de recurrencia (semanal simple vs RRULE/iCal). *Recomendado:* semanal simple para MVP.

---

## 4. Resumen del contrato de integración
P1 enchufa en P0 por estos seams, **todos aditivos** (migraciones nuevas, sin
romper datos ni el frontend):

| P1 | Seam de P0 | Cambio | ¿Toca frontend? |
|---|---|---|---|
| HAL multi-marca | #2 Adaptador RTU (skills reciben `device`) | `RtuAdapter` + `getAdapter` + col `marca` | No |
| Roles | #1 `perfiles.rol` (default RESIDENT) | valor `ADMIN` + políticas + `/admin` | Solo rutas nuevas |
| Recurrencia | #3 campo `tipo` en form/skill | `tipo`+`recurrencia` + rama en `tick` | Solo rama nueva |

**Regla de oro:** ningún ítem de P1 modifica la lógica de dominio probada ni los
contratos de los puertos — extiende detrás de ellos. Los tests de P0 deben seguir
verdes tras cada ítem de P1.
