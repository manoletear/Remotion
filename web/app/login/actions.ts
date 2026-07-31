"use server";

import { createSessionClient } from "@/lib/supabase";

export interface LoginState {
  error?: string;
  sent?: boolean;
}

export async function sendMagicLinkAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Ingresa tu correo electrónico." };

  // Cookie-aware client (not a bare anon client): signInWithOtp's PKCE code
  // verifier must be persisted in a cookie here so /auth/callback's
  // exchangeCodeForSession can read it back later.
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("signInWithOtp failed:", error.status, error.message);
    return { error: "No se pudo enviar el enlace. Intenta de nuevo." };
  }
  return { sent: true };
}
