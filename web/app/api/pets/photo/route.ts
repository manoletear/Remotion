import { NextRequest, NextResponse } from "next/server";

import { getCurrentResident } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import { petPhotoPath, validatePetPhoto } from "@/lib/pet-photo";

/**
 * Pet photo upload for an *existing* pet (specs/003-household-permanent-access,
 * FR-011) — adding or replacing a photo after creation. For creating a pet
 * with its photo in one step, see `/api/pets` instead.
 *
 * Thin server-side proxy, not direct client->Storage (research.md): validates
 * size/format with specific error messages, then writes to the
 * `mascotas-fotos` bucket via the service-role client at
 * `{propiedad_id}/{pet_id}.{ext}`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { ctx, propertyId } = await getCurrentResident();

  const form = await request.formData();
  const petId = String(form.get("pet_id") ?? "");
  const photo = form.get("photo");

  if (!petId || !(photo instanceof File)) {
    return NextResponse.json({ error: "Falta la mascota o la foto." }, { status: 400 });
  }

  const pet = await ctx.store.pets.get(petId);
  if (!pet || pet.propiedad_id !== propertyId) {
    return NextResponse.json({ error: "Mascota no encontrada." }, { status: 404 });
  }

  const validated = validatePetPhoto(photo);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const path = petPhotoPath(propertyId, petId, validated.ext);
  const buffer = Buffer.from(await photo.arrayBuffer());
  const { error: uploadError } = await createServiceClient()
    .storage.from("mascotas-fotos")
    .upload(path, buffer, { contentType: photo.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  await ctx.store.pets.update(petId, { foto_path: path });
  return NextResponse.json({ ok: true, path });
}
