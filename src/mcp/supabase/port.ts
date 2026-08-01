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
import type { InvitationStatus, ResidentStatus } from "../../shared/enums.js";

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

/** Aggregate of all repositories — the unit injected into skills. */
export interface DataStore {
  condominiums: CondominiumRepository;
  properties: PropertyRepository;
  residents: ResidentRepository;
  devices: DeviceRepository;
  invitations: InvitationRepository;
  events: EventRepository;
  pets: PetRepository;
}
