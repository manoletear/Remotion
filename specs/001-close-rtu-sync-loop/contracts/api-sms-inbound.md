# Contract: `POST /api/sms/inbound`

Twilio inbound SMS webhook. Drives User Story 2 and User Story 3 (spec.md).

## Request

- **Method**: `POST`, `Content-Type: application/x-www-form-urlencoded` (Twilio's standard
  webhook format).
- **Expected fields** (Twilio-provided form fields): `From` (the device/RTU's number),
  `Body` (the SMS reply text). Other Twilio fields are ignored.
- **Signature header**: `X-Twilio-Signature`, verified per `research.md`'s HMAC-SHA1
  decision against the full callback URL (must exactly match the URL configured in the
  Twilio console, including protocol/host) and the posted form parameters.

## Response

- **200 OK**, empty body — on successful signature verification and persistence. Twilio
  expects a fast 200; the route does not wait on any downstream reconciliation.
- **403 Forbidden** — signature missing or invalid. **No row is written to `inbound_sms`
  in this case** (FR-005). This is the primary artifact proving User Story 3's acceptance
  scenarios.

## Behavior contract

1. Read the raw form body and the `X-Twilio-Signature` header.
2. Verify the signature (`web/lib/twilio_signature.ts`) using `TWILIO_AUTH_TOKEN`. On
   failure: respond `403`, write an audit event of kind `RTU_SECURITY_RISK` or equivalent
   rejected-inbound marker (reuse the existing `event_type` enum value introduced in
   migration `0005` for unexplained/suspicious device activity — do not invent a new enum
   value for this if an existing one fits; if none fits, note it as a task rather than
   silently skipping the audit requirement from FR-006), and return.
3. On success: insert one row into `inbound_sms` (`from_number = From`, `body = Body`,
   `received_at = now()`) via the service-role client. Do **not** interpret `body` here —
   interpretation is `pollReply`/`parseQueryReply`'s job, invoked later from a `tick`.
4. Respond `200`.

## Non-goals

- This route does not resolve any invitation's state directly — it only persists the raw
  reply for the next `tick` to consume via `pollInbound`, preserving Constitution III
  (dispatch/confirmation decoupling — the webhook is not a confirmation resolver).
- Correlating a specific reply to a specific invitation remains `confirmInFlight`'s
  responsibility, unchanged by this feature.
