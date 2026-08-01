import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillContext } from "gsm-gate-access-layer";
import { redirect } from "next/navigation";

import { makeServerContext } from "./context";
import { createSessionClient } from "./supabase";

export interface CurrentAdmin {
  ctx: SkillContext;
  condominioId: string;
  /**
   * The raw RLS-scoped session client — admin pages are pure read-only
   * reporting over data that spans several tables with no single
   * `DataStore` port method for "everything in my condominium," so they
   * query directly rather than growing the business-logic port for
   * report-only joins. RLS (migration 0007) is what actually enforces the
   * boundary; this is just how the page reaches it.
   */
  supabase: SupabaseClient;
}

/**
 * Resolve the acting administrator for the current request. Mirrors
 * `getCurrentResident()`'s shape (specs/004-admin-dashboard), but checks
 * `perfiles.rol === 'ADMIN'` and returns a `condominioId` instead of a
 * resident/property — an admin need not also be a resident (migration 0007).
 *
 * `ctx.store` here is still the session-scoped client: RLS (the new
 * `*_select_admin` policies from 0007) is what actually widens visibility to
 * the whole condominium, not this function — this is only the auth seam,
 * same division of responsibility `getCurrentResident()` already has.
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: perfil, error: perfilError } = await supabase
    .from("perfiles")
    .select("rol, condominio_id")
    .eq("id", user.id)
    .single();

  // Redirect to "/", not "/login" — the middleware bounces an already
  // authenticated session straight back out of "/login" to "/", which would
  // silently swallow this redirect and make /admin look like it "does
  // nothing" instead of clearly denying access to a non-admin account.
  if (perfilError || perfil?.rol !== "ADMIN" || !perfil.condominio_id) {
    redirect("/");
  }

  return {
    ctx: makeServerContext(supabase),
    condominioId: perfil.condominio_id,
    supabase,
  };
}
