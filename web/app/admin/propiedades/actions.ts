"use server";

import { inviteOwner } from "gsm-gate-access-layer";
import { revalidatePath } from "next/cache";

import { getCurrentAdmin } from "@/lib/admin-session";

export interface InviteOwnerActionState {
  error?: string;
  success?: boolean;
}

function claimBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/reclamar`;
}

export async function invitarPropietarioAction(
  _prevState: InviteOwnerActionState,
  formData: FormData,
): Promise<InviteOwnerActionState> {
  const { ctx, adminId } = await getCurrentAdmin();

  try {
    await inviteOwner(ctx, adminId, {
      propiedad_id: String(formData.get("propiedad_id") ?? ""),
      nombre: String(formData.get("nombre") ?? "").trim(),
      telefono: String(formData.get("telefono") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim() || null,
      claimBaseUrl: claimBaseUrl(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("invitarPropietarioAction failed:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { error: `No se pudo enviar la invitación: ${message}` };
  }

  // Same success response whether a new invite was created or the contact
  // was already registered elsewhere — FR-012, no enumeration signal.
  revalidatePath("/admin/propiedades");
  return { success: true };
}
