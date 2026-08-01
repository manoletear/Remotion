import type { Resident } from "../../domain/resident/index.js";
import { syncAddPermanent } from "../../orchestration/permanent_access_sync.js";
import { ResidentTipo } from "../../shared/enums.js";
import { ValidationError } from "../../shared/errors.js";
import { Validator } from "../../shared/validators.js";
import type { SkillContext } from "../context.js";

export interface AddEmployeeInput {
  propiedad_id: string;
  nombre: string;
  telefono: string;
  rut: string;
  /** Vehicle plate — informational only, no device tie (spec US2, scenario 2). */
  patente?: string;
}

/**
 * Add Employee skill (specs/003-household-permanent-access, US2).
 *
 * Same as {@link addFamilyMember} plus RUT check-digit validation (FR-007) —
 * rejected before anything is saved or dispatched. `patente` is free-text
 * metadata; it never participates in RTU sync.
 */
export async function addEmployee(
  ctx: SkillContext,
  input: AddEmployeeInput,
): Promise<Resident> {
  const v = new Validator();
  v.requireNonEmpty(input.nombre, "nombre");
  const phone = v.phone(input.telefono, "telefono");
  const rut = v.rut(input.rut, "rut");
  v.throwIfInvalid("Invalid employee");

  const existing = await ctx.store.residents.findByPhone(phone!);
  if (existing) {
    throw new ValidationError("Duplicate phone number", [
      `telefono ${phone} is already registered on this property`,
    ]);
  }

  const resident = await ctx.store.residents.create({
    propiedad_id: input.propiedad_id,
    nombre: input.nombre.trim(),
    telefono: phone!,
    tipo: ResidentTipo.EMPLEADO,
    rut: rut!,
    patente: input.patente?.trim() || null,
  });

  return syncAddPermanent(ctx, resident.id);
}
