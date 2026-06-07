# Access Layer for GSM Gate Openers — Architecture

A digital access-management layer for condominiums that already operate
automatic gates via GSM RTU devices (e.g. RTU5024). It does **not** replace the
existing infrastructure; it adds residents, properties, invitations, temporary
permissions, automatic RTU synchronization, and an operational audit trail on
top of the gate that is already installed.

## Core principle

The system is **not** built around the RTU. It is built around:

```text
PERMISO  ->  ACTIVACION  ->  DISPOSITIVO
(permission)  (activation)   (device)
```

The RTU is treated as an **infrastructure adapter** reached over SMS. Business
logic never talks to the relay directly — it composes RTU5024 SMS commands and
dispatches them through the SMS Gateway port.

## Layers (`/src`)

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| Domain | `domain/` | Entity types and the invitation state machine. No I/O. |
| Skills | `skills/` | Use-cases: create/update/cancel/activate/expire invitation, RTU add/remove/query, audit, provisioning. Plain functions over a `SkillContext`. |
| MCP adapters | `mcp/` | Ports + implementations: `supabase` (persistence), `sms_gateway` (Twilio + fake), `scheduler`, `notifications`. |
| Orchestration | `orchestration/` | `rtu_sync` (the add/remove sync engine) and `invitation_lifecycle` (the scheduler-driven `tick`). |
| Shared | `shared/` | enums, constants, validators, errors, utils. |

Skills depend on **ports** (interfaces), never on concrete infrastructure, so
the in-memory/fake adapters and the real Supabase/Twilio adapters are
interchangeable. This is what lets the whole cycle run in tests without
hardware (`src/lifecycle.test.ts`) and in the demo (`npm run demo`).

## Domain entities

`Condominium` → `Property` → `Resident` (permanent) and `Invitation`
(temporary). `Device` is the RTU attached to a condominium. `Event` is the
immutable audit record.

## Invitation state machine

```text
CREATED ─► PENDING_SYNC ─► ACTIVE ─► EXPIRED ─► REMOVING ─► REMOVED
   │            │            │                     ▲
   │            ▼            └─────────────────────┘ (early cancel)
   └──► REMOVED  ERROR ◄── (any sync failure; retried back to PENDING_SYNC/REMOVING)
```

Transitions are enforced in `domain/invitation` (`assertTransition`). Illegal
moves throw `InvalidTransitionError`.

## Main flow

1. Resident creates an invitation → `CREATED`; activation + expiration jobs are
   scheduled.
2. Scheduler `tick` reaches the activation job → `activateInvitation` →
   `syncAddAccess` assigns an RTU phonebook slot and sends the add command →
   `ACTIVE`.
3. Visitor uses the gate.
4. Scheduler `tick` reaches the expiration job → `expireInvitation` →
   `syncRemoveAccess` sends the delete command → `REMOVED`.

Every step appends events (`INVITATION_*`, `RTU_SYNC_*`) to the bitácora.

## RTU5024 SMS protocol

Built and parsed in `skills/rtu/protocol.ts` (pure functions):

| Operation | Command (password `1234`) |
|-----------|---------------------------|
| Add user at slot | `1234A<slot>#<phone>#` |
| Remove user at slot | `1234A<slot>##` |
| Query authorized list | `1234AL#` |

Slots `100..200` are reserved for invitations; `1..99` for permanent residents.

## Reliability

- RTU sync retries with exponential backoff (2s/4s/8s/16s), configurable via
  `SkillContext.syncRetry`.
- Failures land the invitation in `ERROR` with `sync_attempts` and `last_error`
  recorded; a `RETRY` job re-drives it toward its intended end state.
- Slot assignment is deterministic and idempotent, so re-running a sync does not
  duplicate device entries. The invitation's `dispositivo_id` + `rtu_slot` are set
  together on activation and cleared on removal, and a partial unique index on
  `(dispositivo_id, rtu_slot)` enforces per-device slot uniqueness at the DB level.

## Persistence

Schema lives in `supabase/migrations/0001_access_layer_core.sql`. Table names
(`condominios`, `propiedades`, `residentes`, `dispositivos`, `invitaciones`,
`eventos`) and Postgres enums mirror `shared/enums.ts` exactly.

## Out of MVP scope

License-plate reading, facial recognition, QR, video surveillance, biometrics,
and mobile-operator integrations.
