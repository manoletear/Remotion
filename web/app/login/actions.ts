"use server";

import { createServiceClient } from "@/lib/supabase";

export async function sendMagicLinkAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Ingresa tu correo electrónico." };

  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error) return { error: "No se pudo enviar el enlace. Intenta de nuevo." };
  return {};
}
