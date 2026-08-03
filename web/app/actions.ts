"use server";

import { cancelInvitation, createInvitation } from "gsm-gate-access-layer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentResident } from "@/lib/session";

export interface ActionState {
  error?: string;
}

/**
 * Combine a `date` field with explicit hour/minute/AM-PM fields (the
 * dropdown-based time picker in the "new invitation" form) into ISO 8601.
 * Avoids relying on a native `datetime-local` AM/PM spinner, which is fiddly
 * across browsers/locales.
 *
 * Uses the browser's timezone offset (sent as a hidden field, since the
 * date/hour/minute values are wall-clock time *in the browser's timezone*)
 * rather than `new Date(y, m, d, h, mi)`, which would construct the date in
 * the server's timezone instead — wrong on Vercel, which runs in UTC, and
 * silently wrong by exactly that offset for anyone not in UTC.
 */
function toIso(formData: FormData, prefix: "inicio" | "fin"): string {
  const fecha = String(formData.get(`${prefix}_fecha`) ?? "");
  const hora12 = Number(formData.get(`${prefix}_hora`));
  const minuto = Number(formData.get(`${prefix}_min`));
  const ampm = String(formData.get(`${prefix}_ampm`) ?? "AM");
  const tzOffsetMinutes = Number(formData.get("tz_offset_minutes") ?? 0);

  const hora24 = (hora12 % 12) + (ampm === "PM" ? 12 : 0);
  const [year, month, day] = fecha.split("-").map(Number);
  const utcMs = Date.UTC(year!, month! - 1, day!, hora24, minuto) + tzOffsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

export async function crearInvitacionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { ctx, propertyId } = await getCurrentResident();
    await createInvitation(ctx, {
      propiedad_id: propertyId,
      visitante_nombre: String(formData.get("nombre") ?? "").trim(),
      visitante_telefono: String(formData.get("telefono") ?? "").trim(),
      fecha_inicio: toIso(formData, "inicio"),
      fecha_fin: toIso(formData, "fin"),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("crearInvitacionAction failed:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { error: `No se pudo crear la invitación: ${message}` };
  }
  revalidatePath("/");
  redirect("/");
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
