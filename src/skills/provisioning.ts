import type { Condominium } from "../domain/condominium/index.js";
import type { Device } from "../domain/device/index.js";
import type { Property } from "../domain/property/index.js";
import type { Resident } from "../domain/resident/index.js";
import { DeviceType, EntityType, EventType } from "../shared/enums.js";
import { NotFoundError } from "../shared/errors.js";
import { Validator } from "../shared/validators.js";
import { auditEvent } from "./audit_event.js";
import type { SkillContext } from "./context.js";

/**
 * Administrative provisioning skills used by the Administracion view: register
 * condominiums, properties, permanent residents and RTU devices. Each emits its
 * auditable event so the bitacora reflects setup changes too.
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
  await auditEvent(ctx, {
    tipo: EventType.USER_CREATED,
    entidad: EntityType.RESIDENT,
    entidad_id: resident.id,
    payload: { propiedad_id: resident.propiedad_id },
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
