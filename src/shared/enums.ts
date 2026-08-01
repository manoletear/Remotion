/**
 * Canonical enumerations for the Access Layer domain.
 *
 * These values are the single source of truth. They are mirrored by the
 * Supabase schema (Postgres enums / check constraints) and must be kept in
 * sync with `supabase/migrations`.
 */

/** Lifecycle states of an Invitation (permiso temporal). */
export enum InvitationStatus {
  /** Invitation created, not yet scheduled for sync. */
  CREATED = "CREATED",
  /** Waiting to be synchronized with the RTU. */
  PENDING_SYNC = "PENDING_SYNC",
  /** Access successfully loaded on the device. */
  ACTIVE = "ACTIVE",
  /** Validity window ended. */
  EXPIRED = "EXPIRED",
  /** Removal from the device is in progress. */
  REMOVING = "REMOVING",
  /** Removal confirmed by the device. */
  REMOVED = "REMOVED",
  /** A synchronization operation failed. */
  ERROR = "ERROR",
}

/** Kind of permanent access-holder a resident row represents. */
export enum ResidentTipo {
  /** The admin-seeded, login-owning resident. */
  RESIDENT = "RESIDENT",
  FAMILIAR = "FAMILIAR",
  EMPLEADO = "EMPLEADO",
}

/**
 * Lifecycle states of a permanent access-holder (permiso permanente) — a
 * FAMILIAR or EMPLEADO resident row. No CREATED (dispatch is immediate on
 * add, not scheduled) and no EXPIRED (this access has no time window).
 */
export enum ResidentStatus {
  /** Waiting to be synchronized with the RTU. */
  PENDING_SYNC = "PENDING_SYNC",
  /** Access successfully loaded on the device. */
  ACTIVE = "ACTIVE",
  /** Removal from the device is in progress. */
  REMOVING = "REMOVING",
  /** Removal confirmed by the device. */
  REMOVED = "REMOVED",
  /** A synchronization operation failed. */
  ERROR = "ERROR",
}

/** Operational status of a Condominium. */
export enum CondominiumStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

/** Supported RTU device families. The RTU is treated as an infra adapter. */
export enum DeviceType {
  /** King Pigeon / generic RTU5024 GSM relay controller. */
  RTU5024 = "RTU5024",
}

/** Operational status of a Device. */
export enum DeviceStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  UNKNOWN = "UNKNOWN",
}

/**
 * Auditable event types. Every meaningful state change in the system emits
 * one of these via the Audit Event skill.
 */
export enum EventType {
  INVITATION_CREATED = "INVITATION_CREATED",
  INVITATION_UPDATED = "INVITATION_UPDATED",
  INVITATION_CANCELLED = "INVITATION_CANCELLED",
  INVITATION_ACTIVATED = "INVITATION_ACTIVATED",
  INVITATION_EXPIRED = "INVITATION_EXPIRED",
  RTU_SYNC_STARTED = "RTU_SYNC_STARTED",
  RTU_SYNC_SUCCESS = "RTU_SYNC_SUCCESS",
  RTU_SYNC_FAILED = "RTU_SYNC_FAILED",
  /** An authorized number on the device that no active invitation explains
   *  (salvaged Condogate ActionStatus.SECURITY_RISK). Flagged, not auto-removed. */
  RTU_SECURITY_RISK = "RTU_SECURITY_RISK",
  USER_CREATED = "USER_CREATED",
  USER_UPDATED = "USER_UPDATED",
  PROPERTY_CREATED = "PROPERTY_CREATED",
  DEVICE_REGISTERED = "DEVICE_REGISTERED",
}

/** The kind of entity an Event refers to. */
export enum EntityType {
  CONDOMINIUM = "CONDOMINIUM",
  PROPERTY = "PROPERTY",
  RESIDENT = "RESIDENT",
  DEVICE = "DEVICE",
  INVITATION = "INVITATION",
}

/** RTU operations the access layer can request from a device. */
export enum RtuOperation {
  ADD_USER = "ADD_USER",
  REMOVE_USER = "REMOVE_USER",
  QUERY_USER = "QUERY_USER",
}

/** Result of an RTU operation as reported by the device adapter. */
export enum RtuResultStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  TIMEOUT = "TIMEOUT",
  NOT_FOUND = "NOT_FOUND",
}
