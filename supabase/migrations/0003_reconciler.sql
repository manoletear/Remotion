-- RTU reconciler support: decouple command dispatch from confirmation.
--
-- The RTU answers over SMS asynchronously, so the lifecycle dispatches a command
-- (recording when, in `sent_at`) and confirms it later by reading the device's
-- reply. Inbound replies arrive via the Twilio webhook and are parked in
-- `inbound_sms`; the gateway's pollReply consumes the oldest matching one.

-- When the in-flight RTU command was dispatched (PENDING_SYNC / REMOVING). Used
-- to correlate the reply and to time the command out against the ack window.
alter table invitaciones add column sent_at timestamptz;

-- Inbound SMS replies from devices, written by the Twilio inbound webhook and
-- consumed (marked) by the reconciler when it confirms an in-flight command.
create table inbound_sms (
  id           uuid primary key default gen_random_uuid(),
  from_number  text not null,
  body         text not null,
  received_at  timestamptz not null default now(),
  consumed_at  timestamptz
);

-- Fast lookup of the oldest unconsumed reply from a given device since an instant.
create index inbound_sms_unconsumed_idx
  on inbound_sms (from_number, received_at)
  where consumed_at is null;
