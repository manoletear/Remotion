# Access Layer for GSM Gate Openers

A digital access-management layer for condominiums that already use GSM RTU gate
openers (e.g. RTU5024). It adds resident/property management, temporary
invitations, automatic RTU synchronization, and an operational audit trail —
**without replacing any existing hardware**.

> Architectural principle: `PERMISO → ACTIVACIÓN → DISPOSITIVO`. The RTU is an
> infrastructure adapter behind an SMS gateway. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Quick start

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (in-memory + fake RTU)
npm run demo        # full create → activate → expire cycle, printed
```

The demo provisions a condominium, creates a 2-hour invitation, activates it
(RTU add command), then expires it (RTU remove command), and prints the SMS the
device received plus the audit trail — all against the in-memory adapters, no
hardware required.

## Project layout

```text
src/
  domain/         entities + invitation state machine
  skills/         use-cases (create/activate/expire/cancel invitation, rtu_*, audit, provisioning)
  mcp/            adapter ports + impls: supabase, sms_gateway, scheduler, notifications
  orchestration/  rtu_sync engine + invitation_lifecycle scheduler tick
  shared/         enums, constants, validators, errors, utils
supabase/
  migrations/     SQL schema mirroring the domain
```

## Wiring real infrastructure

Swap the fake adapters for the real ones — business logic is unchanged because
skills depend only on ports:

```ts
import { createClient } from "@supabase/supabase-js";
import {
  SupabaseDataStore, TwilioSmsGateway, InMemoryScheduler, ConsoleNotifier,
  makeContext, createInvitation,
} from "./src/index.js";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ctx = makeContext({
  store: new SupabaseDataStore(db),
  sms: new TwilioSmsGateway({
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    from: process.env.TWILIO_FROM!,
  }),
  scheduler: new InMemoryScheduler(), // replace with a durable scheduler in prod
  notifier: new ConsoleNotifier(),
});
```

Copy `.env.example` to `.env` and fill in credentials.

## Database

Apply `supabase/migrations/0001_access_layer_core.sql` to a Supabase project.
Table and enum names mirror `src/shared/enums.ts`.

## Status

MVP backend foundation: domain, skills, MCP adapter ports, orchestration, and
the SQL schema. Frontend (Next.js views) and durable scheduler/notification
adapters are the next milestones.
