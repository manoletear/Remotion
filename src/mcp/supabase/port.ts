import type {
  Condominium,
  Device,
  Event,
  Invitation,
  NewCondominium,
  NewDevice,
  NewEvent,
  NewInvitation,
  NewProperty,
  NewResident,
  Property,
  Resident,
} from "../../domain/index.js";
import type { InvitationStatus, OwnerInvitationStatus, ResidentStatus } from "../../shared/enums.js";

/**
 * Persistence port (Supabase MCP).
 *
 * Skills depend on these interfaces, never on a concrete database client. This
 * keeps the domain free of infrastructure and lets us swap the in-memory store
 * for the Supabase adapter without touching business logic.
 */

export interface CondominiumRepository {
  create(input: NewCondominium): Promise<Condominium>;
  get(id: string): Promise<Condominium | null>;
  list(): Promise<Condominium[]>;
}

export interface PropertyRepository {
  create(input: NewProperty): Promise<Property>;
  get(id: string): Promise<Property | null>;
  listByCondominium(condominioId: string): Promise<Property[]>;
}

/**
 * Editable fields of a resident after creation. Includes the permanent-access
 * sync fields (specs/003-household-permanent-access) alongside the original
 * profile fields.
 */
export type ResidentPatch = Partial<
  Pick<
    Resident,
    | "nombre"
    | "telefono"
    | "apellido"
    | "avatar_url"
    | "rut"
    | "patente"
    | "estado"
    | "dispositivo_id"
    | "rtu_slot"
    | "sent_at"
    | "sync_attempts"
    | "last_error"
    | "removal_requested"
  >
>;

export interface ResidentRepository {
  create(input: NewResident): Promise<Resident>;
  get(id: string): Promise<Resident | null>;
  listByProperty(propiedadId: string): Promise<Resident[]>;
  update(id: string, patch: ResidentPatch): Promise<Resident>;
  /** Residents (any tipo) whose phone matches, for FR-008 duplicate checks. */
  findByPhone(phone: string): Promise<Resident | null>;
  /** Residents currently in the given status (for confirmInFlightPermanent). */
  listByStatus(status: ResidentStatus): Promise<Resident[]>;
  /** Slots already taken on a device by a resident row, to assign a fresh one. */
  occupiedSlots(deviceId: string): Promise<number[]>;
}

export interface DeviceRepository {
  create(input: NewDevice): Promise<Device>;
  get(id: string): Promise<Device | null>;
  /** The device that serves a given property (via its condominium). */
  getForProperty(propiedadId: string): Promise<Device | null>;
  /** The device whose SIM is this number, if any — used to attribute an
   *  inbound SMS (legitimate or forged) to a device for the audit trail. */
  getBySimNumber(numeroSim: string): Promise<Device | null>;
}

/**
 * Fields of an invitation that may change after creation. Excludes invariants
 * (`id`, `propiedad_id`, `created_at`, visitor identity is editable but the row
 * identity is not) so the state-machine contract can't be bypassed by a stray
 * write to an immutable column.
 */
export type InvitationPatch = Partial<
  Pick<
    Invitation,
    | "estado"
    | "cancelled"
    | "dispositivo_id"
    | "rtu_slot"
    | "sent_at"
    | "sync_attempts"
    | "last_error"
    | "visitante_nombre"
    | "visitante_telefono"
    | "motivo"
    | "patente"
    | "fecha_inicio"
    | "fecha_fin"
  >
>;

export interface InvitationRepository {
  create(input: NewInvitation): Promise<Invitation>;
  get(id: string): Promise<Invitation | null>;
  listByProperty(propiedadId: string): Promise<Invitation[]>;
  /** Persist a partial update of mutable fields and return the new row. */
  update(id: string, patch: InvitationPatch): Promise<Invitation>;
  /** Invitations currently in the given status (for the scheduler to act on). */
  listByStatus(status: InvitationStatus): Promise<Invitation[]>;
  /** Slots already taken on a device, to assign a fresh one. */
  occupiedSlots(deviceId: string): Promise<number[]>;
}

export interface EventRepository {
  append(input: NewEvent): Promise<Event>;
  /** Audit trail for an entity, newest first. */
  listForEntity(entidadId: string, limit?: number): Promise<Event[]>;
}

/** A household pet — informational only, no device interaction (FR-006). */
export interface Pet {
  id: string;
  propiedad_id: string;
  nombre: string;
  foto_path: string | null;
  created_at: string;
}

export type NewPet = Pick<Pet, "propiedad_id" | "nombre">;

export interface PetRepository {
  create(input: NewPet): Promise<Pet>;
  get(id: string): Promise<Pet | null>;
  listByProperty(propiedadId: string): Promise<Pet[]>;
  update(id: string, patch: Partial<Pick<Pet, "foto_path">>): Promise<Pet>;
  delete(id: string): Promise<void>;
}

/**
 * A claim link (specs/005-owner-onboarding) that replaces manually running
 * `update perfiles` to link an auth account to a resident. `token_hash`, not
 * the raw token, is ever persisted (research.md) — the raw token exists only
 * in the URL sent to the owner and the request that claims it.
 */
export interface OwnerInvitation {
  id: string;
  resident_id: string;
  token_hash: string;
  channel_email: string | null;
  channel_phone: string | null;
  status: OwnerInvitationStatus;
  expires_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  invited_by: string;
  created_at: string;
}

export type NewOwnerInvitation = Pick<
  OwnerInvitation,
  "resident_id" | "channel_email" | "channel_phone" | "invited_by"
>;

export interface OwnerInvitationRepository {
  /** Creates the invitation, invalidating any prior PENDING one for the same
   *  resident_id (research.md — at most one valid link per pending owner). */
  create(input: NewOwnerInvitation, tokenHash: string, expiresAt: string): Promise<OwnerInvitation>;
  /** The only way this repository is ever queried by the claim flow. */
  findByTokenHash(tokenHash: string): Promise<OwnerInvitation | null>;
  /** Atomic conditional claim (research.md) — null if the row wasn't PENDING
   *  and unexpired at the moment of the call. */
  claim(id: string, claimedBy: string, now: string): Promise<OwnerInvitation | null>;
}

/**
 * The auth-user <-> resident link (`perfiles`, migration 0004). Historically
 * written by hand (`update perfiles set residente_id = ...`) — this is the
 * first skill-level need for it, added by 005 for the claim step. Only what
 * the claim flow needs; not a general profile CRUD surface.
 */
export interface ProfileRepository {
  linkResident(authUserId: string, residentId: string): Promise<void>;
  /** True once some auth account has been linked to this resident — the
   *  actual "claimed" signal `inviteOwner` uses to tell a re-invite of a
   *  still-pending owner apart from a genuinely already-registered one. */
  isLinked(residentId: string): Promise<boolean>;
}

/** Aggregate of all repositories — the unit injected into skills. */
export interface DataStore {
  condominiums: CondominiumRepository;
  properties: PropertyRepository;
  residents: ResidentRepository;
  devices: DeviceRepository;
  invitations: InvitationRepository;
  events: EventRepository;
  pets: PetRepository;
  ownerInvitations: OwnerInvitationRepository;
  profiles: ProfileRepository;
}
