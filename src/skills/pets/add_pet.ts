import type { Pet } from "../../mcp/supabase/port.js";
import { Validator } from "../../shared/validators.js";
import type { SkillContext } from "../context.js";

export interface AddPetInput {
  propiedad_id: string;
  nombre: string;
}

/**
 * Add Pet skill (specs/003-household-permanent-access, US3).
 *
 * Purely informational — never touches `SmsGatewayPort` or `SchedulerPort`
 * (FR-006). Photo upload is a separate web-layer concern
 * (`web/app/api/pets/photo/route.ts`) that patches `foto_path` afterward.
 */
export async function addPet(ctx: SkillContext, input: AddPetInput): Promise<Pet> {
  const v = new Validator();
  v.requireNonEmpty(input.nombre, "nombre");
  v.throwIfInvalid("Invalid pet");

  return ctx.store.pets.create({
    propiedad_id: input.propiedad_id,
    nombre: input.nombre.trim(),
  });
}
