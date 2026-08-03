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
  OwnerInvitationStatus,
  ResidentStatus,
  ResidentTipo,
} from "../../shared/enums.js";
import { RTU5024 } from "../../shared/constants.js";
import type {
  DataStore,
  InvitationPatch,
  NewOwnerInvitation,
  NewPet,
  OwnerInvitation,
  Pet,
  ResidentPatch,
} from "./port.js";

/** Physical table names. Kept in one place and mirrored by the SQL migration. */
const TABLES = {
  condominiums: "condominios",
  properties: "propiedades",
  residents: "residentes",
  devices: "dispositivos",
  invitations: "invitaciones",
  events: "eventos",
  pets: "mascotas",
  ownerInvitations: "owner_invitations",
  profiles: "perfiles",
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
    // `estado` is computed here rather than left to the DB column default
    // (migration 0006 defaults it to ACTIVE unconditionally) — FAMILIAR/
    // EMPLEADO rows need to start PENDING_SYNC so syncAddPermanent's
    // actionable-status check ever fires; relying on the column default was
    // a latent bug (only the in-memory fake computed this correctly, so
    // tests passed while the real adapter silently skipped RTU dispatch).
    create: async (input: NewResident): Promise<Resident> =>
      single(
        await this.db
          .from(TABLES.residents)
          .insert({
            ...input,
            estado:
              input.estado ??
              ((input.tipo ?? ResidentTipo.RESIDENT) === ResidentTipo.RESIDENT
                ? ResidentStatus.ACTIVE
                : ResidentStatus.PENDING_SYNC),
          })
          .select()
          .single(),
      ),
    get: async (id: string): Promise<Resident | null> =>
      maybeOne(await this.db.from(TABLES.residents).select().eq("id", id).maybeSingle()),
    listByProperty: async (propiedadId: string): Promise<Resident[]> =>
      many(await this.db.from(TABLES.residents).select().eq("propiedad_id", propiedadId)),
    update: async (id: string, patch: ResidentPatch): Promise<Resident> =>
      single(await this.db.from(TABLES.residents).update(patch).eq("id", id).select().single()),
    findByPhone: async (phone: string): Promise<Resident | null> =>
      maybeOne(await this.db.from(TABLES.residents).select().eq("telefono", phone).maybeSingle()),
    listByStatus: async (status: ResidentStatus): Promise<Resident[]> =>
      many(await this.db.from(TABLES.residents).select().eq("estado", status)),
    occupiedSlots: async (deviceId: string): Promise<number[]> => {
      const rows = many<{ rtu_slot: number | null }>(
        await this.db
          .from(TABLES.residents)
          .select("rtu_slot")
          .eq("dispositivo_id", deviceId)
          .not("rtu_slot", "is", null),
      );
      return rows.flatMap((r) => (r.rtu_slot === null ? [] : [r.rtu_slot]));
    },
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
    getBySimNumber: async (numeroSim: string): Promise<Device | null> =>
      maybeOne(
        await this.db.from(TABLES.devices).select().eq("numero_sim", numeroSim).maybeSingle(),
      ),
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
      const rows = many<{ rtu_slot: number | null }>(
        await this.db
          .from(TABLES.invitations)
          .select("rtu_slot")
          .eq("dispositivo_id", deviceId)
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

  pets = {
    create: async (input: NewPet): Promise<Pet> =>
      single(await this.db.from(TABLES.pets).insert(input).select().single()),
    get: async (id: string): Promise<Pet | null> =>
      maybeOne(await this.db.from(TABLES.pets).select().eq("id", id).maybeSingle()),
    listByProperty: async (propiedadId: string): Promise<Pet[]> =>
      many(await this.db.from(TABLES.pets).select().eq("propiedad_id", propiedadId)),
    update: async (id: string, patch: Partial<Pick<Pet, "foto_path">>): Promise<Pet> =>
      single(await this.db.from(TABLES.pets).update(patch).eq("id", id).select().single()),
    delete: async (id: string): Promise<void> => {
      const res = await this.db.from(TABLES.pets).delete().eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
  };

  ownerInvitations = {
    create: async (
      input: NewOwnerInvitation,
      tokenHash: string,
      expiresAt: string,
    ): Promise<OwnerInvitation> => {
      // Invalidate any prior PENDING invitation for this resident first — the
      // partial unique index (owner_invitations_one_pending_per_resident)
      // would otherwise reject the insert below (research.md).
      const invalidated = await this.db
        .from(TABLES.ownerInvitations)
        .update({ status: OwnerInvitationStatus.INVALIDATED })
        .eq("resident_id", input.resident_id)
        .eq("status", OwnerInvitationStatus.PENDING);
      if (invalidated.error) throw new Error(invalidated.error.message);

      return single(
        await this.db
          .from(TABLES.ownerInvitations)
          .insert({
            resident_id: input.resident_id,
            channel_email: input.channel_email,
            channel_phone: input.channel_phone,
            invited_by: input.invited_by,
            token_hash: tokenHash,
            expires_at: expiresAt,
            status: OwnerInvitationStatus.PENDING,
          })
          .select()
          .single(),
      );
    },
    findByTokenHash: async (tokenHash: string): Promise<OwnerInvitation | null> =>
      maybeOne(
        await this.db.from(TABLES.ownerInvitations).select().eq("token_hash", tokenHash).maybeSingle(),
      ),
    claim: async (id: string, claimedBy: string, now: string): Promise<OwnerInvitation | null> =>
      maybeOne(
        await this.db
          .from(TABLES.ownerInvitations)
          .update({ status: OwnerInvitationStatus.CLAIMED, claimed_at: now, claimed_by: claimedBy })
          .eq("id", id)
          .eq("status", OwnerInvitationStatus.PENDING)
          .gt("expires_at", now)
          .select()
          .maybeSingle(),
      ),
  };

  profiles = {
    linkResident: async (authUserId: string, residentId: string): Promise<void> => {
      const res = await this.db
        .from(TABLES.profiles)
        .insert({ id: authUserId, residente_id: residentId, rol: "RESIDENT" });
      if (res.error) throw new Error(res.error.message);
    },
    isLinked: async (residentId: string): Promise<boolean> => {
      const rows = many<{ id: string }>(
        await this.db.from(TABLES.profiles).select("id").eq("residente_id", residentId).limit(1),
      );
      return rows.length > 0;
    },
  };
}

/** Convenience factory once you have a configured client. */
export function createSupabaseDataStore(client: SupabaseClient): SupabaseDataStore {
  return new SupabaseDataStore(client);
}
