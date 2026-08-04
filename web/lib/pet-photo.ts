export const PET_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const PET_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Validate a pet photo upload, returning its storage extension or an error message. */
export function validatePetPhoto(photo: File): { ext: string } | { error: string } {
  if (photo.size > PET_PHOTO_MAX_BYTES) {
    return { error: "La foto no puede superar 5MB." };
  }
  const ext = PET_PHOTO_TYPES[photo.type];
  if (!ext) {
    return { error: "Formato no soportado, usa JPG, PNG o WEBP." };
  }
  return { ext };
}

/** Storage path for a pet's photo in the private `mascotas-fotos` bucket. */
export function petPhotoPath(propiedadId: string, petId: string, ext: string): string {
  return `${propiedadId}/${petId}.${ext}`;
}
