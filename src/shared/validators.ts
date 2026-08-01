import { ValidationError } from "./errors.js";
import { isNonEmptyString, normalizePhone } from "./utils.js";

/**
 * RTU5024 command passwords are numeric (4-8 digits). Enforcing this prevents a
 * password containing protocol framing characters (`#`, command letters like
 * `A`) from being concatenated into an SMS command and producing an unintended
 * device instruction.
 */
const RTU_PASSWORD_REGEX = /^\d{4,8}$/;

/** Throw {@link ValidationError} if a device password is not RTU5024-safe. */
export function assertRtuPassword(password: string): void {
  if (!RTU_PASSWORD_REGEX.test(password)) {
    throw new ValidationError("Invalid RTU password", [
      "password must be 4-8 digits (no protocol delimiters)",
    ]);
  }
}

/**
 * Validate and normalize a Chilean RUT, including its check digit (módulo 11).
 * Accepts dots/dash/space formatting and a lowercase or uppercase "k" check
 * digit; returns the canonical `XXXXXXXX-X` form, or `null` if the format or
 * the check digit itself is invalid. RUT is sensitive PII (FR-010 in
 * specs/003-household-permanent-access) — this function only validates and
 * normalizes it; callers are responsible for keeping it out of audit
 * payloads and notifications.
 */
export function normalizeRut(value: string): string | null {
  const cleaned = value.replace(/[.\s]/g, "").toUpperCase();
  const match = /^(\d{7,8})-?([0-9K])$/.exec(cleaned);
  if (!match) return null;
  const [, body, dv] = match as unknown as [string, string, string];

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);

  return expected === dv ? `${body}-${dv}` : null;
}

/** Accumulates validation issues and throws a single {@link ValidationError}. */
export class Validator {
  private readonly issues: string[] = [];

  require(condition: boolean, message: string): this {
    if (!condition) this.issues.push(message);
    return this;
  }

  requireNonEmpty(value: unknown, field: string): this {
    return this.require(isNonEmptyString(value), `${field} is required`);
  }

  /** Validate and return a normalized E.164 phone, or record an issue. */
  phone(value: string, field: string): string | null {
    const normalized = normalizePhone(value);
    if (!normalized) {
      this.issues.push(`${field} is not a valid phone number: "${value}"`);
      return null;
    }
    return normalized;
  }

  /** Validate and return a normalized RUT, or record an issue. */
  rut(value: string, field: string): string | null {
    const normalized = normalizeRut(value);
    if (!normalized) {
      this.issues.push(`${field} is not a valid RUT: "${value}"`);
      return null;
    }
    return normalized;
  }

  /** True when no issues were recorded. */
  get ok(): boolean {
    return this.issues.length === 0;
  }

  /** Throw if any issues were accumulated. */
  throwIfInvalid(message = "Validation failed"): void {
    if (!this.ok) throw new ValidationError(message, [...this.issues]);
  }
}

/**
 * Validate an invitation validity window. Returns parsed Date objects.
 * Enforces start < end and that the window has not already ended.
 */
export function validateValidityWindow(
  startIso: string,
  endIso: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const v = new Validator();
  const start = new Date(startIso);
  const end = new Date(endIso);

  v.require(!Number.isNaN(start.getTime()), `fecha_inicio is invalid: ${startIso}`);
  v.require(!Number.isNaN(end.getTime()), `fecha_fin is invalid: ${endIso}`);

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    v.require(start < end, "fecha_inicio must be before fecha_fin");
    v.require(end > now, "fecha_fin must be in the future");
  }

  v.throwIfInvalid("Invalid validity window");
  return { start, end };
}
