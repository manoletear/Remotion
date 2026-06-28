/**
 * Typed error hierarchy for the FNRH tunnel. Mirrors the Access Layer's
 * `src/shared/errors.ts` so skills and orchestration throw distinguishable
 * failure classes that the audit trail can record.
 */

export class DomainError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable code, e.g. `VALIDATION_FAILED`. */
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Raised when input fails validation. */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message, "VALIDATION_FAILED", { issues });
  }
}

/** Raised when a referenced entity does not exist. */
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND", { entity, id });
  }
}

/** Raised on an illegal Ficha state transition. */
export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Illegal transition ${from} -> ${to}`, "INVALID_TRANSITION", {
      from,
      to,
    });
  }
}

/**
 * Raised when an SNRHos call fails. `retryable` distinguishes a transient
 * server/network failure (→ contingency queue) from a payload rejection
 * (→ ERROR, needs correction).
 */
export class SnrhosSyncError extends DomainError {
  constructor(
    message: string,
    readonly retryable: boolean,
    details?: Record<string, unknown>,
  ) {
    super(message, "SNRHOS_SYNC_ERROR", { ...details, retryable });
  }
}

/** Raised when a document cannot be read by OCR/MRZ with enough confidence. */
export class DocumentScanError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DOCUMENT_SCAN_ERROR", details);
  }
}
