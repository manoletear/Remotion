import { randomUUID } from "node:crypto";

/** Generate a v4 UUID for new domain entities. */
export function newId(): string {
  return randomUUID();
}

/** Current instant as an ISO-8601 string (UTC). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Sleep helper for backoff loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async operation with exponential-backoff retries (baseMs * 2^(n-1)).
 * Lifted from the Access Layer's `withRetry` so the contingency drain reuses the
 * same proven 2s/4s/8s/16s policy. `shouldRetry` decides per error.
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
