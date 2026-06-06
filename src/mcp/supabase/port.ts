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
import type { InvitationStatus } from "../../shared/enums.js";

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

export interface ResidentRepository {
  create(input: NewResident): Promise<Resident>;
  get(id: string): Promise<Resident | null>;
  listByProperty(propiedadId: string): Promise<Resident[]>;
}

export interface DeviceRepository {
  create(input: NewDevice): Promise<Device>;
  get(id: string): Promise<Device | null>;
  /** The device that serves a given property (via its condominium). */
  getForProperty(propiedadId: string): Promise<Device | null>;
}

export interface InvitationRepository {
  create(input: NewInvitation): Promise<Invitation>;
  get(id: string): Promise<Invitation | null>;
  listByProperty(propiedadId: string): Promise<Invitation[]>;
  /** Persist a partial update and return the new row. */
  update(id: string, patch: Partial<Invitation>): Promise<Invitation>;
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

/** Aggregate of all repositories — the unit injected into skills. */
export interface DataStore {
  condominiums: CondominiumRepository;
  properties: PropertyRepository;
  residents: ResidentRepository;
  devices: DeviceRepository;
  invitations: InvitationRepository;
  events: EventRepository;
}
