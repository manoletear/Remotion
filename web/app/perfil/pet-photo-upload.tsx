"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Uploads a pet's photo via the server-side proxy route (research.md), then
 * refreshes the page so the new photo shows up. Separate from the
 * useActionState add-pet flow since a server action can't easily stream a
 * multipart upload with per-step progress/error feedback of its own.
 */
export function PetPhotoUpload({ petId }: { petId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const formData = new FormData(e.currentTarget);
    formData.set("pet_id", petId);
    try {
      const res = await fetch("/api/pets/photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir la foto.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="pet-photo-form">
      <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
      <button type="submit" className="ghost" disabled={busy}>
        {busy ? "Subiendo…" : "Subir foto"}
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
