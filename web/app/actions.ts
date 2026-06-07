"use server";

import {
  cancelInvitation,
  createInvitation,
  tick,
} from "gsm-gate-access-layer";
import { revalidatePath } from "next/cache";

import { getContext } from "@/lib/context";

/** datetime-local (`YYYY-MM-DDTHH:mm`, local) -> ISO 8601 for the domain layer. */
function toIso(value: FormDataEntryValue | null): string {
  return new Date(String(value)).toISOString();
}

export async function crearInvitacionAction(formData: FormData): Promise<void> {
  const { ctx, propertyId } = await getContext();
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
  const { ctx } = await getContext();
  await cancelInvitation(ctx, String(formData.get("id")));
  revalidatePath("/");
}

/**
 * Manually drive the lifecycle clock. In production this is a Vercel Cron hitting
 * /api/tick every minute (P0-M5); for the M0 fakes demo it's a button so you can
 * watch CREATED -> ACTIVE -> REMOVED happen on demand.
 */
export async function procesarCicloAction(): Promise<void> {
  const { ctx } = await getContext();
  await tick(ctx, new Date());
  revalidatePath("/");
}
