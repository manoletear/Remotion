import { NextRequest, NextResponse } from "next/server";

import { getCurrentResident } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Pet photo upload (specs/003-household-permanent-access, FR-011).
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

  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "La foto no puede superar 5MB." },
      { status: 400 },
    );
  }
  const ext = ALLOWED_TYPES[photo.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Formato no soportado, usa JPG, PNG o WEBP." },
      { status: 400 },
    );
  }

  const path = `${propertyId}/${petId}.${ext}`;
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
