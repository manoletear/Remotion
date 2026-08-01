import type { Resident } from "../../domain/resident/index.js";
import { syncAddPermanent } from "../../orchestration/permanent_access_sync.js";
import { ResidentTipo } from "../../shared/enums.js";
import { ValidationError } from "../../shared/errors.js";
import { Validator } from "../../shared/validators.js";
import type { SkillContext } from "../context.js";

export interface AddFamilyMemberInput {
  propiedad_id: string;
  nombre: string;
  telefono: string;
}

/**
 * Add Family Member skill (specs/003-household-permanent-access, US1).
 *
 * Validates input, rejects a phone already registered to any resident on
 * this property (FR-008), persists the row as `FAMILIAR`, and dispatches
 * real permanent RTU access immediately — non-blocking, same
 * dispatch/confirm shape as `createInvitation`.
 */
export async function addFamilyMember(
  ctx: SkillContext,
  input: AddFamilyMemberInput,
): Promise<Resident> {
  const v = new Validator();
  v.requireNonEmpty(input.nombre, "nombre");
  const phone = v.phone(input.telefono, "telefono");
  v.throwIfInvalid("Invalid family member");

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
    tipo: ResidentTipo.FAMILIAR,
  });

  return syncAddPermanent(ctx, resident.id);
}
