import { InvalidTransitionError } from "../../shared/errors.js";
import { InvitationStatus } from "../../shared/enums.js";

/** A temporary access permission for a visitor. */
export interface Invitation {
  id: string;
  propiedad_id: string;
  visitante_nombre: string;
  /** E.164 phone number authorized to operate the gate. */
  visitante_telefono: string;
  /** ISO-8601 start of the validity window. */
  fecha_inicio: string;
  /** ISO-8601 end of the validity window. */
  fecha_fin: string;
  estado: InvitationStatus;
  /** RTU phonebook slot assigned while ACTIVE; null when not loaded. */
  rtu_slot: number | null;
  /** Number of failed sync attempts so far. */
  sync_attempts: number;
  /** Last sync error message, when estado === ERROR. */
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type NewInvitation = Pick<
  Invitation,
  | "propiedad_id"
  | "visitante_nombre"
  | "visitante_telefono"
  | "fecha_inicio"
  | "fecha_fin"
>;

/**
 * Allowed state transitions for an invitation.
 *
 * Happy path: CREATED -> PENDING_SYNC -> ACTIVE -> REMOVING -> REMOVED.
 * EXPIRED marks the validity end before removal; ERROR is recoverable and can
 * be retried back into PENDING_SYNC or removal.
 */
const TRANSITIONS: Readonly<Record<InvitationStatus, readonly InvitationStatus[]>> = {
  [InvitationStatus.CREATED]: [
    InvitationStatus.PENDING_SYNC,
    InvitationStatus.REMOVED, // cancelled before it was ever synced
  ],
  [InvitationStatus.PENDING_SYNC]: [
    InvitationStatus.ACTIVE,
    InvitationStatus.ERROR,
    InvitationStatus.REMOVING, // cancelled mid-flight
  ],
  [InvitationStatus.ACTIVE]: [
    InvitationStatus.EXPIRED,
    InvitationStatus.REMOVING, // early cancellation
  ],
  [InvitationStatus.EXPIRED]: [InvitationStatus.REMOVING],
  [InvitationStatus.REMOVING]: [
    InvitationStatus.REMOVED,
    InvitationStatus.ERROR,
  ],
  [InvitationStatus.ERROR]: [
    InvitationStatus.PENDING_SYNC, // retry activation
    InvitationStatus.REMOVING, // retry removal
    InvitationStatus.REMOVED,
  ],
  [InvitationStatus.REMOVED]: [], // terminal
};

/** Whether a transition from `from` to `to` is permitted. */
export function canTransition(
  from: InvitationStatus,
  to: InvitationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a transition, throwing {@link InvalidTransitionError} when illegal.
 * Use this in skills before persisting a new status.
 */
export function assertTransition(
  from: InvitationStatus,
  to: InvitationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Terminal states no longer participate in the lifecycle. */
export function isTerminal(status: InvitationStatus): boolean {
  return status === InvitationStatus.REMOVED;
}

/** An invitation is "loaded" on the device while ACTIVE. */
export function isLoadedOnDevice(invitation: Invitation): boolean {
  return invitation.estado === InvitationStatus.ACTIVE;
}

/** Whether the invitation's validity window covers the given instant. */
export function isWithinWindow(invitation: Invitation, at: Date = new Date()): boolean {
  return (
    at >= new Date(invitation.fecha_inicio) && at <= new Date(invitation.fecha_fin)
  );
}
