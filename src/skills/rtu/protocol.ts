/**
 * RTU5024 SMS protocol.
 *
 * Pure functions that translate access-layer intents into the exact SMS command
 * strings an RTU5024 understands, and that interpret the device's reply. No I/O
 * here — the rtu_* skills feed these through the SMS Gateway MCP. This is the
 * heart of the "RTU as infrastructure adapter" boundary.
 */
import { RtuResultStatus } from "../../shared/enums.js";

/** Build the command to authorize a phone number at a phonebook slot. */
export function buildAddUserCommand(password: string, slot: number, phone: string): string {
  return `${password}A${pad(slot)}#${phone}#`;
}

/** Build the command to delete the authorized number at a slot. */
export function buildRemoveUserCommand(password: string, slot: number): string {
  return `${password}A${pad(slot)}##`;
}

/** Build the command to list authorized numbers. */
export function buildQueryCommand(password: string): string {
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
 * Parse a query reply into the set of authorized phone numbers it reports.
 * RTU5024 list replies enumerate slots like `001:+5691...`; we extract any
 * E.164-looking tokens. Returns null on timeout.
 */
export function parseQueryReply(reply: string | null): string[] | null {
  if (reply === null) return null;
  const matches = reply.match(/\+[1-9]\d{6,14}/g);
  return matches ? [...new Set(matches)] : [];
}

/** True when a queried number is present in the device's authorized list. */
export function queryReplyContains(reply: string | null, phone: string): RtuResultStatus {
  const numbers = parseQueryReply(reply);
  if (numbers === null) return RtuResultStatus.TIMEOUT;
  return numbers.includes(phone) ? RtuResultStatus.SUCCESS : RtuResultStatus.NOT_FOUND;
}
