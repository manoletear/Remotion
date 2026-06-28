import { InvalidTransitionError } from "../../shared/errors.js";
import { FichaStatus } from "../../shared/enums.js";
import type { Hospede } from "../hospede/index.js";

/**
 * A Ficha is one guest's FNRH registration through its full lifecycle, from the
 * pre-check-in link to its closure in the federal base. It is the FNRH analogue
 * of the Access Layer's `Invitation`: a local state machine wrapping an external
 * sync (SNRHos instead of the RTU).
 */
export interface Ficha {
  id: string;
  /** PMS reservation locator this ficha is bound to (mirror of `Reservas.cs`). */
  reservaLocalizador: string;
  /** Contact used to deliver the pre-check-in link (E.164 phone or email). */
  contactoTitular: string;
  estado: FichaStatus;
  /** Guest payload; null until the guest completes capture (DRAFT). */
  hospede: Hospede | null;
  /** SNRHos protocol id returned on successful registration; null otherwise. */
  protocoloSnrhos: string | null;
  /** ISO-8601 check-in instant, set when REGISTERED. */
  checkinAt: string | null;
  /** ISO-8601 check-out instant, set when CHECKED_OUT. */
  checkoutAt: string | null;
  /** Number of failed sync attempts so far. */
  syncAttempts: number;
  /** Last sync error message, when estado === ERROR. */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewFicha = Pick<
  Ficha,
  "reservaLocalizador" | "contactoTitular"
>;

/**
 * Allowed state transitions for a Ficha.
 *
 * Happy path: DRAFT -> CAPTURED -> PENDING_SYNC -> REGISTERED -> CHECKED_OUT.
 * CONTINGENCY absorbs transient SNRHos outages (5xx/timeout) and drains back to
 * REGISTERED; ERROR holds 4xx rejections for correction.
 */
const TRANSITIONS: Readonly<Record<FichaStatus, readonly FichaStatus[]>> = {
  [FichaStatus.DRAFT]: [FichaStatus.CAPTURED, FichaStatus.CANCELLED],
  [FichaStatus.CAPTURED]: [FichaStatus.PENDING_SYNC, FichaStatus.CANCELLED],
  [FichaStatus.PENDING_SYNC]: [
    FichaStatus.REGISTERED,
    FichaStatus.CONTINGENCY,
    FichaStatus.ERROR,
  ],
  [FichaStatus.CONTINGENCY]: [
    FichaStatus.PENDING_SYNC, // re-queued for a drain attempt
    FichaStatus.REGISTERED, // queue drained when SNRHos recovers
    FichaStatus.ERROR,
  ],
  [FichaStatus.REGISTERED]: [FichaStatus.CHECKED_OUT, FichaStatus.CANCELLED],
  [FichaStatus.ERROR]: [
    FichaStatus.PENDING_SYNC, // retry after correction
    FichaStatus.CANCELLED,
  ],
  [FichaStatus.CHECKED_OUT]: [], // terminal
  [FichaStatus.CANCELLED]: [], // terminal
};

/** Whether a transition from `from` to `to` is permitted. */
export function canTransition(from: FichaStatus, to: FichaStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a transition, throwing {@link InvalidTransitionError} when illegal.
 * Use this in skills/orchestration before persisting a new status.
 */
export function assertTransition(from: FichaStatus, to: FichaStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Terminal states no longer participate in the lifecycle. */
export function isTerminal(status: FichaStatus): boolean {
  return status === FichaStatus.CHECKED_OUT || status === FichaStatus.CANCELLED;
}

/** A ficha is legally registered once it has reached SNRHos. */
export function isRegistered(ficha: Ficha): boolean {
  return (
    ficha.estado === FichaStatus.REGISTERED ||
    ficha.estado === FichaStatus.CHECKED_OUT
  );
}
