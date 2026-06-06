-- Durable scheduler jobs, backing src/mcp/scheduler/supabase_scheduler.ts.
-- A worker/cron polls PENDING jobs whose run_at has passed, dispatches them via
-- the invitation_lifecycle tick, and marks them DONE.

create type job_kind as enum ('ACTIVATION', 'EXPIRATION', 'RETRY');
create type job_status as enum ('PENDING', 'DONE');

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          job_kind not null,
  invitation_id uuid not null references invitaciones (id) on delete cascade,
  run_at        timestamptz not null,
  status        job_status not null default 'PENDING',
  created_at    timestamptz not null default now()
);

-- Fast lookup of due work.
create index jobs_due_idx on jobs (status, run_at);

-- At most one pending job of each kind per invitation (matches the adapter's
-- replace-on-reschedule semantics and prevents duplicate activations).
create unique index jobs_pending_unique
  on jobs (invitation_id, kind)
  where status = 'PENDING';
