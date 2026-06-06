import { randomUUID } from "node:crypto";

import { DEFAULT_COUNTRY_CODE, PHONE_E164_REGEX } from "./constants.js";

/** Generate a v4 UUID for new domain entities. */
export function newId(): string {
  return randomUUID();
}

/** Current instant as an ISO-8601 string (UTC). */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Normalize a phone number to E.164.
 *
 * Accepts numbers already in E.164, numbers with a leading `00` international
 * prefix, or local numbers (which are prefixed with {@link DEFAULT_COUNTRY_CODE}).
 * Spaces, dashes, dots and parentheses are stripped. Returns `null` when the
 * input cannot be coerced into a valid E.164 number.
 */
export function normalizePhone(
  raw: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;
  let cleaned = raw.replace(/[\s\-.()]/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  if (!cleaned.startsWith("+")) {
    // Local number: drop a single leading zero (trunk prefix) then prepend code.
    cleaned = `${defaultCountryCode}${cleaned.replace(/^0+/, "")}`;
  }

  return PHONE_E164_REGEX.test(cleaned) ? cleaned : null;
}

/** Sleep helper for backoff loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async operation with exponential-backoff retries.
 *
 * `shouldRetry` decides, per error, whether another attempt is warranted.
 * Backoff is `baseMs * 2^(attempt-1)`.
 */
export async function withRetry<T>(
  op: (attempt: number) => Promise<T>,
  options: {
    maxAttempts: number;
    baseMs: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  const { maxAttempts, baseMs, shouldRetry = () => true, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) break;
      onRetry?.(attempt, error);
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/** Type guard: is the value a non-empty string after trimming. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
