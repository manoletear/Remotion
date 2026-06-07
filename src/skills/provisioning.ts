import type { Condominium } from "../domain/condominium/index.js";
import type { Device } from "../domain/device/index.js";
import type { Property } from "../domain/property/index.js";
import type { Resident } from "../domain/resident/index.js";
import type { ResidentPatch } from "../mcp/supabase/port.js";
import { DeviceType, EntityType, EventType } from "../shared/enums.js";
import { NotFoundError } from "../shared/errors.js";
import { assertRtuPassword, Validator } from "../shared/validators.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";

/**
 * Administrative provisioning skills used by the Administracion view: register
 * condominiums, properties, permanent residents and RTU devices. Property,
 * resident and device registration each emit their auditable event
 * (PROPERTY_CREATED / USER_CREATED / DEVICE_REGISTERED). Condominium creation
 * has no dedicated event in the documented catalog, so it is not audited here.
 */

export async function registerCondominium(
  ctx: SkillContext,
  input: { nombre: string },
): Promise<Condominium> {
  new Validator().requireNonEmpty(input.nombre, "nombre").throwIfInvalid();
  return ctx.store.condominiums.create({ nombre: input.nombre.trim() });
}

export async function registerProperty(
  ctx: SkillContext,
  input: { condominio_id: string; numero: string },
): Promise<Property> {
  new Validator()
    .requireNonEmpty(input.numero, "numero")
    .requireNonEmpty(input.condominio_id, "condominio_id")
    .throwIfInvalid();

  const condominium = await ctx.store.condominiums.get(input.condominio_id);
  if (!condominium) throw new NotFoundError("Condominium", input.condominio_id);

  const property = await ctx.store.properties.create({
    condominio_id: input.condominio_id,
    numero: input.numero.trim(),
  });
  await auditEvent(ctx, {
    tipo: EventType.PROPERTY_CREATED,
    entidad: EntityType.PROPERTY,
    entidad_id: property.id,
    payload: { condominio_id: property.condominio_id, numero: property.numero },
  });
  return property;
}

export async function registerResident(
  ctx: SkillContext,
  input: { propiedad_id: string; nombre: string; telefono: string },
): Promise<Resident> {
  const v = new Validator();
  v.requireNonEmpty(input.nombre, "nombre");
  v.requireNonEmpty(input.propiedad_id, "propiedad_id");
  const phone = v.phone(input.telefono, "telefono");
  v.throwIfInvalid();

  const property = await ctx.store.properties.get(input.propiedad_id);
  if (!property) throw new NotFoundError("Property", input.propiedad_id);

  const resident = await ctx.store.residents.create({
    propiedad_id: input.propiedad_id,
    nombre: input.nombre.trim(),
    telefono: phone!,
  });
  // USER_CREATED is the resident lifecycle event (a resident is the permanent
  // authorized user of a property); entidad: RESIDENT disambiguates it.
  await auditEvent(ctx, {
    tipo: EventType.USER_CREATED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { propiedad_id: resident.propiedad_id },
  });
  return resident;
}

/**
 * Update a resident's name and/or phone. Normalizes the phone to E.164, persists
 * only the changed mutable fields, and emits USER_UPDATED.
 */
export async function updateResident(
  ctx: SkillContext,
  input: { id: string; nombre?: string; telefono?: string },
): Promise<Resident> {
  const current = await ctx.store.residents.get(input.id);
  if (!current) throw new NotFoundError("Resident", input.id);

  const v = new Validator();
  const patch: ResidentPatch = {};
  if (input.nombre !== undefined) {
    v.requireNonEmpty(input.nombre, "nombre");
    patch.nombre = input.nombre.trim();
  }
  if (input.telefono !== undefined) {
    const phone = v.phone(input.telefono, "telefono");
    if (phone) patch.telefono = phone;
  }
  v.throwIfInvalid();

  const resident = await ctx.store.residents.update(input.id, patch);
  await auditEvent(ctx, {
    tipo: EventType.USER_UPDATED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { changed: Object.keys(patch) },
  });
  return resident;
}

export async function registerDevice(
  ctx: SkillContext,
  input: {
    condominio_id: string;
    numero_sim: string;
    tipo?: DeviceType;
    password?: string;
  },
): Promise<Device> {
  const v = new Validator();
  v.requireNonEmpty(input.condominio_id, "condominio_id");
  const sim = v.phone(input.numero_sim, "numero_sim");
  v.throwIfInvalid();
  if (input.password !== undefined) assertRtuPassword(input.password);

  const condominium = await ctx.store.condominiums.get(input.condominio_id);
  if (!condominium) throw new NotFoundError("Condominium", input.condominio_id);

  const device = await ctx.store.devices.create({
    condominio_id: input.condominio_id,
    numero_sim: sim!,
    tipo: input.tipo ?? DeviceType.RTU5024,
    ...(input.password ? { password: input.password } : {}),
  });
  await auditEvent(ctx, {
    tipo: EventType.DEVICE_REGISTERED,
    entidad: EntityType.DEVICE,
    entidad_id: device.id,
    payload: { condominio_id: device.condominio_id, tipo: device.tipo },
  });
  return device;
}
