/**
 * System-wide constants.
 *
 * RTU command templates follow the King Pigeon RTU5024 SMS protocol, where the
 * device is configured by sending SMS commands to its SIM. The access layer
 * never talks to the relay directly; it composes these commands and dispatches
 * them through the SMS Gateway MCP. This is the "RTU as infrastructure adapter"
 * principle in practice.
 *
 * RTU5024 SMS command reference (default password `1234`):
 *   - Add authorized number at slot:    `pwdA<slot>#<phone>#`
 *   - Delete authorized number at slot:  `pwdA<slot>##`
 *   - Query authorized numbers:          `pwdAL#`
 *
 * The slot number lets us address a stable position in the device's 200-entry
 * phonebook so additions/removals are deterministic and idempotent.
 */
export const RTU5024 = {
  DEFAULT_PASSWORD: "1234",
  /** Number of authorized-number slots available on an RTU5024. */
  MAX_SLOTS: 200,
  /** First slot reserved for permanent residents; invitations start after. */
  RESIDENT_SLOT_START: 1,
  INVITATION_SLOT_START: 100,
} as const;

/** Retry policy applied to RTU synchronization attempts. */
export const RTU_SYNC_RETRY = {
  MAX_ATTEMPTS: 4,
  /** Base backoff in milliseconds; doubled each attempt (2s, 4s, 8s, 16s). */
  BASE_BACKOFF_MS: 2_000,
} as const;

/** How long to wait for an RTU to acknowledge an SMS command before timing out. */
export const RTU_ACK_TIMEOUT_MS = 60_000;

/** Phone numbers are normalized and stored in E.164 format. */
export const PHONE_E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Default country calling code used when normalizing local numbers. */
export const DEFAULT_COUNTRY_CODE = "+56"; // Chile
