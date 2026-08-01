"use server";

import {
  addEmployee,
  addFamilyMember,
  addPet,
  removeHouseholdMember,
  removePet,
} from "gsm-gate-access-layer";
import { revalidatePath } from "next/cache";

import { getCurrentResident } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import type { ActionState } from "../actions";

export async function agregarFamiliarAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { ctx, propertyId } = await getCurrentResident();
    await addFamilyMember(ctx, {
      propiedad_id: propertyId,
      nombre: String(formData.get("nombre") ?? "").trim(),
      telefono: String(formData.get("telefono") ?? "").trim(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("agregarFamiliarAction failed:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { error: `No se pudo agregar: ${message}` };
  }
  revalidatePath("/perfil");
  return {};
}

export async function agregarEmpleadoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { ctx, propertyId } = await getCurrentResident();
    const patente = String(formData.get("patente") ?? "").trim();
    await addEmployee(ctx, {
      propiedad_id: propertyId,
      nombre: String(formData.get("nombre") ?? "").trim(),
      telefono: String(formData.get("telefono") ?? "").trim(),
      rut: String(formData.get("rut") ?? "").trim(),
      patente: patente || undefined,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("agregarEmpleadoAction failed:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { error: `No se pudo agregar: ${message}` };
  }
  revalidatePath("/perfil");
  return {};
}

export async function removerMiembroAction(formData: FormData): Promise<void> {
  const { ctx, propertyId } = await getCurrentResident();
  const id = String(formData.get("id"));

  // Authorization seam, same pattern as cancelarInvitacionAction: verify the
  // row belongs to the caller's own property before acting on it.
  const resident = await ctx.store.residents.get(id);
  if (!resident || resident.propiedad_id !== propertyId) {
    throw new Error("Miembro no encontrado para esta propiedad.");
  }

  await removeHouseholdMember(ctx, id);
  revalidatePath("/perfil");
}

export async function agregarMascotaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { ctx, propertyId } = await getCurrentResident();
    await addPet(ctx, {
      propiedad_id: propertyId,
      nombre: String(formData.get("nombre") ?? "").trim(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("agregarMascotaAction failed:", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { error: `No se pudo agregar: ${message}` };
  }
  revalidatePath("/perfil");
  return {};
}

export async function removerMascotaAction(formData: FormData): Promise<void> {
  const { ctx, propertyId } = await getCurrentResident();
  const id = String(formData.get("id"));

  const pet = await ctx.store.pets.get(id);
  if (!pet || pet.propiedad_id !== propertyId) {
    throw new Error("Mascota no encontrada para esta propiedad.");
  }

  const removed = await removePet(ctx, id);
  if (removed.foto_path) {
    // Best-effort: the row is already gone; don't fail the whole action if
    // the storage delete has a transient error (FR-012 wants no orphan, not
    // a blocked removal).
    const { error } = await createServiceClient()
      .storage.from("mascotas-fotos")
      .remove([removed.foto_path]);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete pet photo from storage:", error.message);
    }
  }
  revalidatePath("/perfil");
}
