/**
 * Typed error hierarchy for the access layer. Skills and orchestration throw
 * these so callers (and the audit trail) can distinguish failure classes.
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

/** Raised when input fails validation. Carries field-level issues. */
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

/** Raised on an illegal invitation state transition. */
export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Illegal transition ${from} -> ${to}`, "INVALID_TRANSITION", {
      from,
      to,
    });
  }
}

/** Raised when an RTU operation fails or times out. */
export class RtuSyncError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "RTU_SYNC_ERROR", details);
  }
}
