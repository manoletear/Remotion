/**
 * RTU5024 SMS protocol.
 *
 * Pure functions that translate access-layer intents into the exact SMS command
 * strings an RTU5024 understands, and that interpret the device's reply. No I/O
 * here — the rtu_* skills feed these through the SMS Gateway MCP. This is the
 * heart of the "RTU as infrastructure adapter" boundary.
 */
import { RtuResultStatus } from "../../shared/enums.js";
import { assertRtuPassword } from "../../shared/validators.js";

/** Build the command to authorize a phone number at a phonebook slot. */
export function buildAddUserCommand(password: string, slot: number, phone: string): string {
  assertRtuPassword(password);
  // RTU5024 expects the number without leading '+' (e.g. 56981890493, not +56981890493).
  return `${password}A${pad(slot)}#${phone.replace(/^\+/, "")}#`;
}

/** Build the command to delete the authorized number at a slot. */
export function buildRemoveUserCommand(password: string, slot: number): string {
  assertRtuPassword(password);
  return `${password}A${pad(slot)}##`;
}

/** Build the command to list authorized numbers. */
export function buildQueryCommand(password: string): string {
  assertRtuPassword(password);
  return `${password}AL#`;
}

/** RTU5024 slots are addressed as 3-digit, e.g. 001..200. */
function pad(slot: number): string {
  return slot.toString().padStart(3, "0");
}

const FAILURE_HINTS = ["fail", "error", "wrong", "incorrect", "invalid"];

/** Interpret a reply to an add/remove command. Absent reply => caller decides. */
export function parseMutationReply(reply: string | null): RtuResultStatus {
  if (reply === null) return RtuResultStatus.TIMEOUT;
  const lower = reply.toLowerCase();
  if (FAILURE_HINTS.some((h) => lower.includes(h))) return RtuResultStatus.FAILED;
  return RtuResultStatus.SUCCESS;
}

/**
 * Parse a query reply into E.164 phone numbers.
 * RTU5024 AL# replies use the format `040:56984298053` (no leading '+').
 * We normalize each token to E.164 for comparison against DB values.
 * Returns null on timeout.
 */
export function parseQueryReply(reply: string | null): string[] | null {
  if (reply === null) return null;
  // Match digit sequences that look like phone numbers (7-15 digits, with or without '+').
  const matches = reply.match(/\+?[1-9]\d{6,14}/g);
  if (!matches) return [];
  // Normalize to E.164: prepend '+' if missing.
  return [...new Set(matches.map((n) => (n.startsWith("+") ? n : `+${n}`)))];
}

/** True when a queried number is present in the device's authorized list. */
export function queryReplyContains(reply: string | null, phone: string): RtuResultStatus {
  const numbers = parseQueryReply(reply);
  if (numbers === null) return RtuResultStatus.TIMEOUT;
  return numbers.includes(phone) ? RtuResultStatus.SUCCESS : RtuResultStatus.NOT_FOUND;
}
