import { createHash, randomBytes } from "node:crypto";

/**
 * Owner invitation claim tokens (specs/005-owner-onboarding).
 *
 * The raw token is a 256-bit random value, URL-safe. Only its hash is ever
 * persisted (research.md) — the raw value exists solely in the URL sent to
 * the invited owner and in the request that claims it.
 */
export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic hash of a raw claim token, for storage and lookup. */
export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
