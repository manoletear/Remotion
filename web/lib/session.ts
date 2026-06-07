import type { Resident, SkillContext } from "gsm-gate-access-layer";

import { getContext } from "./context";

/** Everything a request needs about the acting resident. */
export interface CurrentResident {
  ctx: SkillContext;
  resident: Resident;
  residentId: string;
  /** The resident's property — scopes every read/write to their unit. */
  propertyId: string;
}

/**
 * Resolve the acting resident for the current request. This is the single
 * **auth seam** of the app: every page and server action goes through it.
 *
 * - M0 (fakes): returns the seeded demo resident.
 * - M2 (real auth): this is the ONLY function that changes — read the Supabase
 *   session, map `auth.uid()` -> `perfiles` -> `residentes`, and resolve a
 *   request-scoped context. Login becomes a drop-in here; nothing above changes.
 */
export async function getCurrentResident(): Promise<CurrentResident> {
  const { ctx, residentId, propertyId } = await getContext();
  const resident = await ctx.store.residents.get(residentId);
  if (!resident) throw new Error("No hay residente en sesión.");
  return { ctx, resident, residentId, propertyId };
}
