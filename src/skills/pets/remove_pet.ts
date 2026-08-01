import type { Pet } from "../../mcp/supabase/port.js";
import { NotFoundError } from "../../shared/errors.js";
import type { SkillContext } from "../context.js";

/**
 * Remove Pet skill (specs/003-household-permanent-access, FR-012).
 *
 * Deletes the `mascotas` row and returns it so the caller (the web layer,
 * which alone knows how to reach Supabase Storage — see research.md's
 * server-side-proxy decision) can delete the associated photo object too,
 * keyed off the returned `foto_path`. This skill has no storage capability
 * of its own; it is not part of `DataStore`/`SkillContext`.
 */
export async function removePet(ctx: SkillContext, petId: string): Promise<Pet> {
  const pet = await ctx.store.pets.get(petId);
  if (!pet) throw new NotFoundError("Pet", petId);
  await ctx.store.pets.delete(petId);
  return pet;
}
