import type { SupabaseClient } from "@supabase/supabase-js";

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
  type InvitationStatus,
} from "../../shared/enums.js";
import { RTU5024 } from "../../shared/constants.js";
import type { DataStore, InvitationPatch } from "./port.js";

/** Physical table names. Kept in one place and mirrored by the SQL migration. */
const TABLES = {
  condominiums: "condominios",
  properties: "propiedades",
  residents: "residentes",
  devices: "dispositivos",
  invitations: "invitaciones",
  events: "eventos",
} as const;

/** Unwrap a Supabase single-row response, throwing on error. */
function single<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error("Expected a row but got none");
  return res.data;
}

/** Unwrap a Supabase multi-row response, throwing on error. */
function many<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

/**
 * Unwrap a Supabase maybe-single response: throw on a real DB/query error,
 * return null only when the row genuinely does not exist. Without this, a failed
 * query would be silently misread as "not found".
 */
function maybeOne<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Supabase-backed implementation of the persistence port. Construct it with a
 * configured `SupabaseClient` (service-role key on the server). Implements the
 * exact same `DataStore` contract the in-memory store does.
 */
export class SupabaseDataStore implements DataStore {
  constructor(private readonly db: SupabaseClient) {}

  condominiums = {
    create: async (input: NewCondominium): Promise<Condominium> =>
      single(
        await this.db
          .from(TABLES.condominiums)
          .insert({ nombre: input.nombre, estado: input.estado ?? CondominiumStatus.ACTIVE })
          .select()
          .single(),
      ),
    get: async (id: string): Promise<Condominium | null> =>
      maybeOne(await this.db.from(TABLES.condominiums).select().eq("id", id).maybeSingle()),
    list: async (): Promise<Condominium[]> =>
      many(await this.db.from(TABLES.condominiums).select()),
  };

  properties = {
    create: async (input: NewProperty): Promise<Property> =>
      single(await this.db.from(TABLES.properties).insert(input).select().single()),
    get: async (id: string): Promise<Property | null> =>
      maybeOne(await this.db.from(TABLES.properties).select().eq("id", id).maybeSingle()),
    listByCondominium: async (condominioId: string): Promise<Property[]> =>
      many(await this.db.from(TABLES.properties).select().eq("condominio_id", condominioId)),
  };

  residents = {
    create: async (input: NewResident): Promise<Resident> =>
      single(await this.db.from(TABLES.residents).insert(input).select().single()),
    get: async (id: string): Promise<Resident | null> =>
      maybeOne(await this.db.from(TABLES.residents).select().eq("id", id).maybeSingle()),
    listByProperty: async (propiedadId: string): Promise<Resident[]> =>
      many(await this.db.from(TABLES.residents).select().eq("propiedad_id", propiedadId)),
  };

  devices = {
    create: async (input: NewDevice): Promise<Device> =>
      single(
        await this.db
          .from(TABLES.devices)
          .insert({
            condominio_id: input.condominio_id,
            tipo: input.tipo,
            numero_sim: input.numero_sim,
            estado: input.estado ?? DeviceStatus.UNKNOWN,
            password: input.password ?? RTU5024.DEFAULT_PASSWORD,
          })
          .select()
          .single(),
      ),
    get: async (id: string): Promise<Device | null> =>
      maybeOne(await this.db.from(TABLES.devices).select().eq("id", id).maybeSingle()),
    getForProperty: async (propiedadId: string): Promise<Device | null> => {
      const property = maybeOne<{ condominio_id: string }>(
        await this.db.from(TABLES.properties).select("condominio_id").eq("id", propiedadId).maybeSingle(),
      );
      if (!property) return null;
      return maybeOne(
        await this.db
          .from(TABLES.devices)
          .select()
          .eq("condominio_id", property.condominio_id)
          .limit(1)
          .maybeSingle(),
      );
    },
  };

  invitations = {
    create: async (input: NewInvitation): Promise<Invitation> =>
      single(await this.db.from(TABLES.invitations).insert(input).select().single()),
    get: async (id: string): Promise<Invitation | null> =>
      maybeOne(await this.db.from(TABLES.invitations).select().eq("id", id).maybeSingle()),
    listByProperty: async (propiedadId: string): Promise<Invitation[]> =>
      many(await this.db.from(TABLES.invitations).select().eq("propiedad_id", propiedadId)),
    update: async (id: string, patch: InvitationPatch): Promise<Invitation> =>
      single(
        await this.db
          .from(TABLES.invitations)
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single(),
      ),
    listByStatus: async (status: InvitationStatus): Promise<Invitation[]> =>
      many(await this.db.from(TABLES.invitations).select().eq("estado", status)),
    occupiedSlots: async (deviceId: string): Promise<number[]> => {
      const device = maybeOne<{ condominio_id: string }>(
        await this.db.from(TABLES.devices).select("condominio_id").eq("id", deviceId).maybeSingle(),
      );
      if (!device) return [];
      const props = many<{ id: string }>(
        await this.db.from(TABLES.properties).select("id").eq("condominio_id", device.condominio_id),
      );
      if (props.length === 0) return [];
      const rows = many<{ rtu_slot: number | null }>(
        await this.db
          .from(TABLES.invitations)
          .select("rtu_slot")
          .in("propiedad_id", props.map((p) => p.id))
          .not("rtu_slot", "is", null),
      );
      return rows.flatMap((r) => (r.rtu_slot === null ? [] : [r.rtu_slot]));
    },
  };

  events = {
    append: async (input: NewEvent): Promise<Event> =>
      single(
        await this.db
          .from(TABLES.events)
          .insert({ ...input, payload: input.payload ?? {} })
          .select()
          .single(),
      ),
    listForEntity: async (entidadId: string, limit = 50): Promise<Event[]> =>
      many(
        await this.db
          .from(TABLES.events)
          .select()
          .eq("entidad_id", entidadId)
          .order("fecha", { ascending: false })
          .limit(limit),
      ),
  };
}

/** Convenience factory once you have a configured client. */
export function createSupabaseDataStore(client: SupabaseClient): SupabaseDataStore {
  return new SupabaseDataStore(client);
}
