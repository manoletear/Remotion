"use server";

import {
  cancelInvitation,
  createInvitation,
  tick,
} from "gsm-gate-access-layer";
import { revalidatePath } from "next/cache";

import { getCurrentResident } from "@/lib/session";

/** datetime-local (`YYYY-MM-DDTHH:mm`, local) -> ISO 8601 for the domain layer. */
function toIso(value: FormDataEntryValue | null): string {
  return new Date(String(value)).toISOString();
}

export async function crearInvitacionAction(formData: FormData): Promise<void> {
  const { ctx, propertyId } = await getCurrentResident();
  await createInvitation(ctx, {
    propiedad_id: propertyId,
    visitante_nombre: String(formData.get("nombre") ?? "").trim(),
    visitante_telefono: String(formData.get("telefono") ?? "").trim(),
    fecha_inicio: toIso(formData.get("inicio")),
    fecha_fin: toIso(formData.get("fin")),
  });
  revalidatePath("/");
}

export async function cancelarInvitacionAction(formData: FormData): Promise<void> {
  const { ctx, propertyId } = await getCurrentResident();
  const id = String(formData.get("id"));

  // Authorization seam: a resident may only act on invitations of their own
  // property. Under Supabase this is enforced by RLS; against the fakes we check
  // it explicitly so the boundary is exercised in the same place.
  const inv = await ctx.store.invitations.get(id);
  if (!inv || inv.propiedad_id !== propertyId) {
    throw new Error("Invitación no encontrada para esta propiedad.");
  }

  await cancelInvitation(ctx, id);
  revalidatePath("/");
}

/**
 * Manually drive the lifecycle clock. In production this is a Vercel Cron hitting
 * /api/tick every minute (P0-M5) — a SYSTEM operation, not resident-scoped; for
 * the M0 fakes demo it's a button so you can watch CREATED -> ACTIVE -> REMOVED.
 */
export async function procesarCicloAction(): Promise<void> {
  const { ctx } = await getCurrentResident();
  await tick(ctx, new Date());
  revalidatePath("/");
}
