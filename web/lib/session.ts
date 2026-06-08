import type { Resident, SkillContext } from "gsm-gate-access-layer";
import { redirect } from "next/navigation";

import { makeServerContext } from "./context";
import { createSessionClient } from "./supabase";

export interface CurrentResident {
  ctx: SkillContext;
  resident: Resident;
  residentId: string;
  /** The resident's property — scopes every read/write to their unit. */
  propertyId: string;
}

/**
 * Resolve the acting resident for the current request.
 * Single auth seam: every page and server action goes through here.
 *
 * 1. Get the Supabase session (anon key + cookies).
 * 2. Look up `perfiles` → residente_id (admin-seeded link).
 * 3. Build a SkillContext scoped to the session client (RLS enforced).
 */
export async function getCurrentResident(): Promise<CurrentResident> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: perfil, error: perfilError } = await supabase
    .from("perfiles")
    .select("residente_id")
    .eq("id", user.id)
    .single();

  if (perfilError || !perfil?.residente_id) {
    throw new Error(
      "Tu cuenta no está vinculada a ningún residente. Contacta al administrador.",
    );
  }

  const ctx = makeServerContext(supabase);
  const resident = await ctx.store.residents.get(perfil.residente_id);
  if (!resident) throw new Error("Residente no encontrado.");

  return {
    ctx,
    resident,
    residentId: perfil.residente_id,
    propertyId: resident.propiedad_id,
  };
}
