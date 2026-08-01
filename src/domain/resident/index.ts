import { InvalidTransitionError } from "../../shared/errors.js";
import { ResidentStatus, ResidentTipo } from "../../shared/enums.js";

/**
 * A permanent authorized user attached to a property: the admin-seeded
 * login-owning resident (`RESIDENT`), or a household-managed family member
 * (`FAMILIAR`) / domestic employee (`EMPLEADO`) — see
 * specs/003-household-permanent-access.
 */
export interface Resident {
  id: string;
  propiedad_id: string;
  nombre: string;
  /** E.164 phone number. */
  telefono: string;
  /** Optional family/last name (salvaged Condogate `User.familyName`). */
  apellido: string | null;
  /** Optional avatar image URL (salvaged `User.avatarUrl`). */
  avatar_url: string | null;
  tipo: ResidentTipo;
  /** Chilean RUT, normalized "XXXXXXXX-X". EMPLEADO only. Sensitive — never
   *  include in audit payloads or notifications. */
  rut: string | null;
  /** Vehicle plate. EMPLEADO only. Informational — no device tie. */
  patente: string | null;
  estado: ResidentStatus;
  /** Device the access is loaded on while ACTIVE; null when not loaded. */
  dispositivo_id: string | null;
  /** RTU phonebook slot (1-99) assigned while ACTIVE; null when not loaded. */
  rtu_slot: number | null;
  /** When the in-flight RTU command was dispatched (ISO-8601), while
   *  PENDING_SYNC or REMOVING. Null otherwise. */
  sent_at: string | null;
  sync_attempts: number;
  last_error: string | null;
  /** True once removal has been requested. Disambiguates ERROR-state retry
   *  intent the same way `Invitation.cancelled` does. */
  removal_requested: boolean;
  created_at: string;
}

export type NewResident = Pick<Resident, "propiedad_id" | "nombre" | "telefono"> &
  Partial<Pick<Resident, "apellido" | "avatar_url" | "tipo" | "rut" | "patente">>;

/**
 * Allowed state transitions for a permanent access-holder.
 *
 * Happy path: PENDING_SYNC -> ACTIVE -> REMOVING -> REMOVED. ERROR is
 * recoverable and can be retried back into PENDING_SYNC or REMOVING — the
 * same shape as `domain/invitation`'s, minus CREATED/EXPIRED (see that
 * module's docstring for why: no scheduled activation, no time window).
 */
const TRANSITIONS: Readonly<Record<ResidentStatus, readonly ResidentStatus[]>> = {
  [ResidentStatus.PENDING_SYNC]: [
    ResidentStatus.ACTIVE,
    ResidentStatus.ERROR,
    ResidentStatus.REMOVING, // removed before it ever confirmed
  ],
  [ResidentStatus.ACTIVE]: [ResidentStatus.REMOVING],
  [ResidentStatus.REMOVING]: [ResidentStatus.REMOVED, ResidentStatus.ERROR],
  [ResidentStatus.ERROR]: [
    ResidentStatus.PENDING_SYNC, // retry add
    ResidentStatus.REMOVING, // retry removal
    ResidentStatus.REMOVED,
  ],
  [ResidentStatus.REMOVED]: [], // terminal
};

/** Whether a transition from `from` to `to` is permitted. */
export function canTransitionResident(
  from: ResidentStatus,
  to: ResidentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Validate a transition, throwing {@link InvalidTransitionError} when illegal. */
export function assertResidentTransition(
  from: ResidentStatus,
  to: ResidentStatus,
): void {
  if (!canTransitionResident(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
