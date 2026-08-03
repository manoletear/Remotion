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

  // Optional: where /auth/callback sends the browser after exchanging the
  // code, e.g. "/reclamar/<token>" so an owner invitation claim resumes
  // right where it left off (specs/005-owner-onboarding) instead of landing
  // on "/" and losing the token.
  const next = String(formData.get("next") ?? "").trim();

  // Cookie-aware client (not a bare anon client): signInWithOtp's PKCE code
  // verifier must be persisted in a cookie here so /auth/callback's
  // exchangeCodeForSession can read it back later.
  const supabase = await createSessionClient();
  const callbackUrl = new URL(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`);
  if (next) callbackUrl.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("signInWithOtp failed:", error.status, error.message);
    return { error: "No se pudo enviar el enlace. Intenta de nuevo." };
  }
  return { sent: true };
}
