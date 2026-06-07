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
import {
  CondominiumStatus,
  DeviceStatus,
  InvitationStatus,
} from "../../shared/enums.js";
import { RTU5024 } from "../../shared/constants.js";
import { newId, nowIso } from "../../shared/utils.js";
import type { DataStore, InvitationPatch, ResidentPatch } from "./port.js";

/**
 * In-memory implementation of the persistence port. Used by tests and the
 * local demo. Mirrors the semantics of the Supabase adapter so business logic
 * behaves identically against either backend.
 */
export class InMemoryDataStore implements DataStore {
  private readonly _condominiums = new Map<string, Condominium>();
  private readonly _properties = new Map<string, Property>();
  private readonly _residents = new Map<string, Resident>();
  private readonly _devices = new Map<string, Device>();
  private readonly _invitations = new Map<string, Invitation>();
  private readonly _events: Event[] = [];

  /** Resolve the device serving a property (property -> condominium -> device). */
  private deviceForProperty(propiedadId: string): Device | null {
    const property = this._properties.get(propiedadId);
    if (!property) return null;
    for (const device of this._devices.values()) {
      if (device.condominio_id === property.condominio_id) return device;
    }
    return null;
  }

  condominiums = {
    create: async (input: NewCondominium): Promise<Condominium> => {
      const row: Condominium = {
        id: newId(),
        nombre: input.nombre,
        estado: input.estado ?? CondominiumStatus.ACTIVE,
        created_at: nowIso(),
      };
      this._condominiums.set(row.id, row);
      return row;
    },
    get: async (id: string) => this._condominiums.get(id) ?? null,
    list: async () => [...this._condominiums.values()],
  };

  properties = {
    create: async (input: NewProperty): Promise<Property> => {
      const row: Property = {
        id: newId(),
        numero: input.numero,
        condominio_id: input.condominio_id,
        created_at: nowIso(),
      };
      this._properties.set(row.id, row);
      return row;
    },
    get: async (id: string) => this._properties.get(id) ?? null,
    listByCondominium: async (condominioId: string) =>
      [...this._properties.values()].filter((p) => p.condominio_id === condominioId),
  };

  residents = {
    create: async (input: NewResident): Promise<Resident> => {
      const row: Resident = {
        id: newId(),
        propiedad_id: input.propiedad_id,
        nombre: input.nombre,
        telefono: input.telefono,
        created_at: nowIso(),
      };
      this._residents.set(row.id, row);
      return row;
    },
    get: async (id: string) => this._residents.get(id) ?? null,
    listByProperty: async (propiedadId: string) =>
      [...this._residents.values()].filter((r) => r.propiedad_id === propiedadId),
    update: async (id: string, patch: ResidentPatch): Promise<Resident> => {
      const current = this._residents.get(id);
      if (!current) throw new Error(`Resident not found: ${id}`);
      const next: Resident = { ...current, ...patch };
      this._residents.set(id, next);
      return next;
    },
  };

  devices = {
    create: async (input: NewDevice): Promise<Device> => {
      const row: Device = {
        id: newId(),
        condominio_id: input.condominio_id,
        tipo: input.tipo,
        numero_sim: input.numero_sim,
        estado: input.estado ?? DeviceStatus.UNKNOWN,
        password: input.password ?? RTU5024.DEFAULT_PASSWORD,
        created_at: nowIso(),
      };
      this._devices.set(row.id, row);
      return row;
    },
    get: async (id: string) => this._devices.get(id) ?? null,
    getForProperty: async (propiedadId: string) => this.deviceForProperty(propiedadId),
  };

  invitations = {
    create: async (input: NewInvitation): Promise<Invitation> => {
      const ts = nowIso();
      const row: Invitation = {
        id: newId(),
        propiedad_id: input.propiedad_id,
        visitante_nombre: input.visitante_nombre,
        visitante_telefono: input.visitante_telefono,
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
        estado: InvitationStatus.CREATED,
        cancelled: false,
        dispositivo_id: null,
        rtu_slot: null,
        sync_attempts: 0,
        last_error: null,
        created_at: ts,
        updated_at: ts,
      };
      this._invitations.set(row.id, row);
      return row;
    },
    get: async (id: string) => this._invitations.get(id) ?? null,
    listByProperty: async (propiedadId: string) =>
      [...this._invitations.values()].filter((i) => i.propiedad_id === propiedadId),
    update: async (id: string, patch: InvitationPatch): Promise<Invitation> => {
      const current = this._invitations.get(id);
      if (!current) throw new Error(`Invitation not found: ${id}`);
      const next: Invitation = { ...current, ...patch, updated_at: nowIso() };
      this._invitations.set(id, next);
      return next;
    },
    listByStatus: async (status: InvitationStatus) =>
      [...this._invitations.values()].filter((i) => i.estado === status),
    occupiedSlots: async (deviceId: string) => {
      const slots: number[] = [];
      for (const inv of this._invitations.values()) {
        if (inv.rtu_slot !== null && inv.dispositivo_id === deviceId) {
          slots.push(inv.rtu_slot);
        }
      }
      return slots;
    },
  };

  events = {
    append: async (input: NewEvent): Promise<Event> => {
      const row: Event = {
        id: newId(),
        tipo: input.tipo,
        entidad: input.entidad,
        entidad_id: input.entidad_id,
        payload: input.payload ?? {},
        fecha: nowIso(),
      };
      this._events.push(row);
      return row;
    },
    listForEntity: async (entidadId: string, limit = 50) =>
      this._events
        .filter((e) => e.entidad_id === entidadId)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, limit),
  };
}
