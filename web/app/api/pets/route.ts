import { addPet } from "gsm-gate-access-layer";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentResident } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import { petPhotoPath, validatePetPhoto } from "@/lib/pet-photo";

/**
 * Create a pet and (optionally) its photo in one request (specs/003, FR-011
 * revisited): a Route Handler, not a Server Action, because Next.js server
 * actions cap request bodies at 1MB by default — too small for a 5MB photo.
 * The photo is optional; if it's missing or fails to upload, the pet is
 * still saved (best-effort, same as the standalone /api/pets/photo route) —
 * the resident can add or retry the photo afterward from the pet's card.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { ctx, propertyId } = await getCurrentResident();

  const form = await request.formData();
  const nombre = String(form.get("nombre") ?? "").trim();
  const photo = form.get("foto");

  let pet;
  try {
    pet = await addPet(ctx, { propiedad_id: propertyId, nombre });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ error: `No se pudo agregar: ${message}` }, { status: 400 });
  }

  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ ok: true, pet });
  }

  const validated = validatePetPhoto(photo);
  if ("error" in validated) {
    return NextResponse.json({ ok: true, pet, warning: validated.error });
  }

  const path = petPhotoPath(propertyId, pet.id, validated.ext);
  const buffer = Buffer.from(await photo.arrayBuffer());
  const { error: uploadError } = await createServiceClient()
    .storage.from("mascotas-fotos")
    .upload(path, buffer, { contentType: photo.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ ok: true, pet, warning: uploadError.message });
  }

  await ctx.store.pets.update(pet.id, { foto_path: path });
  return NextResponse.json({ ok: true, pet });
}
