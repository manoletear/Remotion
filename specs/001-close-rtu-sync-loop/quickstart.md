# Quickstart: Validating the Closed RTU Sync Loop

Prerequisites: `.env` populated (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`); dev
server running (`npm run dev` in `web/`); migrations `0001`–`0005` applied.

## 1. Fix the regression first (prerequisite, FR-009 / SC-005)

```bash
npm test
```

Expect `15/15` passing. If the two RTU-protocol tests still fail, stop — this feature's
other steps are not trustworthy until the protocol layer's own tests agree with its code.

## 2. Exercise `/api/tick` unauthenticated in local dev

```bash
curl -i http://localhost:3000/api/tick
```

Expected: `200` with a `TickReport` JSON body (`processed`, `activated`, `expired`,
`retried` counts), even with zero due jobs (`{"processed":0,...}` is a valid, healthy
response).

## 3. Exercise the inbound webhook's signature gate (US3)

```bash
# Forged (no signature) — MUST be rejected
curl -i -X POST http://localhost:3000/api/sms/inbound \
  -d "From=%2B56900000000" -d "Body=OK"
# Expect: 403, and no new row in `inbound_sms`

# Correctly signed — use scripts/sign-inbound.ts (or an equivalent local helper) to
# compute a valid X-Twilio-Signature for TWILIO_AUTH_TOKEN before sending
curl -i -X POST http://localhost:3000/api/sms/inbound \
  -H "X-Twilio-Signature: <computed>" \
  -d "From=%2B56900000000" -d "Body=OK"
# Expect: 200, and exactly one new unconsumed row in `inbound_sms`
```

## 4. End-to-end: activation confirms from a real inbound reply (US1 + US2)

1. Create an invitation via the dashboard with a start time a minute in the past.
2. `curl http://localhost:3000/api/tick` — expect `activated: 1` and the invitation now
   `PENDING_SYNC` with `sent_at` set (dispatch happened; no reply consumed yet).
3. POST a correctly-signed inbound reply (step 3) with `Body` matching a success reply for
   that device's dispatched command.
4. `curl http://localhost:3000/api/tick` again — expect the invitation now `ACTIVE`, and
   the `inbound_sms` row from step 3 now has `consumed_at` set.

## 5. Failure path (US2 acceptance scenario 2)

Repeat steps 1–2, but never send an inbound reply. Wait past `RTU_ACK_TIMEOUT_MS` (60s),
then call `/api/tick` again — expect the invitation in `ERROR` with `last_error` recorded
and a `RETRY` job scheduled (`SC-004`).

## Out of scope for this quickstart

Real-hardware validation against a physical RTU5024 (vs. the fake gateway / manually-posted
webhook payloads above) is a separate follow-on validation step per the spec's Assumptions.
